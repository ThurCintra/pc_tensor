import { z } from 'zod';
import type { Db } from '@pc-tensor/db';
import { hashPassword, randomToken, sha256, verifyAgainstDummy, verifyPassword } from './crypto';
import { badRequest, conflict, notFound } from './errors';
import type { Mailer } from './mailer';

export const Email = z.string().trim().toLowerCase().email('E-mail inválido.').max(254);

/** Mínimo de 10 caracteres (NIST 800-63B recomenda tamanho, não regras de símbolos). */
export const Password = z.string().min(10, 'A senha precisa de pelo menos 10 caracteres.').max(256);

export const RegisterInput = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(80),
  email: Email,
  password: Password,
});

export const SettingsInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    kwhTariff: z.number().min(0).max(10),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  kwhTariff: number;
  hasPassword: boolean;
  createdAt: string;
}

type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  kwhTariff: unknown;
  passwordHash: string | null;
  createdAt: Date;
};

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    kwhTariff: Number(u.kwhTariff),
    hasPassword: u.passwordHash !== null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function registerUser(db: Db, input: z.infer<typeof RegisterInput>): Promise<PublicUser> {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('Já existe uma conta com este e-mail.', 'EMAIL_TAKEN');

  const user = await db.user.create({
    data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password) },
  });
  return toPublicUser(user);
}

/** Login por e-mail e senha. Mesma resposta (e tempo parecido) para e-mail inexistente e senha errada. */
export async function verifyCredentials(db: Db, email: string, password: string): Promise<PublicUser | null> {
  const parsed = Email.safeParse(email);
  if (!parsed.success) return null;
  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (!user?.passwordHash) {
    await verifyAgainstDummy(password);
    return null;
  }
  return (await verifyPassword(user.passwordHash, password)) ? toPublicUser(user) : null;
}

/**
 * Login com Google/GitHub: acha a conta pelo vínculo do provedor; senão pelo e-mail (só se o provedor
 * garantir que o e-mail é verificado, para ninguém tomar uma conta criando um login com o e-mail alheio);
 * senão cria a conta.
 */
export async function upsertOAuthUser(
  db: Db,
  input: {
    provider: string;
    providerAccountId: string;
    email: string;
    emailVerified: boolean;
    name: string | null;
    image: string | null;
  },
): Promise<PublicUser> {
  const linked = await db.account.findUnique({
    where: { provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId } },
    include: { user: true },
  });
  if (linked) return toPublicUser(linked.user);

  const email = Email.parse(input.email);
  if (!input.emailVerified) throw badRequest('O provedor não confirmou este e-mail.', 'EMAIL_NOT_VERIFIED');

  const user = await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    const target =
      existing ??
      (await tx.user.create({ data: { email, name: input.name?.trim() || email.split('@')[0]!, image: input.image } }));
    await tx.account.create({
      data: { userId: target.id, provider: input.provider, providerAccountId: input.providerAccountId },
    });
    return target;
  });
  return toPublicUser(user);
}

export async function getUser(db: Db, userId: string): Promise<PublicUser> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('Conta não encontrada.');
  return toPublicUser(user);
}

export async function updateSettings(
  db: Db,
  userId: string,
  input: z.infer<typeof SettingsInput>,
): Promise<PublicUser> {
  const user = await db.user.update({ where: { id: userId }, data: input });
  return toPublicUser(user);
}

// Recuperação de senha ---------------------------------------------------------------------------

const RESET_TTL_MS = 60 * 60_000;

/**
 * Envia o link de redefinição. Sempre "dá certo" para quem chama (não revela se o e-mail tem conta).
 * Só o hash do token vai para o banco; pedir de novo invalida os links anteriores.
 */
export async function requestPasswordReset(
  db: Db,
  rawEmail: string,
  deps: { mailer: Mailer; appUrl: string; now?: () => Date },
): Promise<void> {
  const parsed = Email.safeParse(rawEmail);
  if (!parsed.success) return;
  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (!user) return;

  const now = deps.now?.() ?? new Date();
  const token = randomToken('pct_reset');
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) },
    }),
  ]);

  const link = `${deps.appUrl.replace(/\/$/, '')}/redefinir-senha?token=${encodeURIComponent(token)}`;
  await deps.mailer({
    to: user.email,
    subject: 'Redefinir sua senha do pc_tensor',
    text: `Olá, ${user.name}.\n\nPara criar uma nova senha, abra o link abaixo (vale por 1 hora):\n${link}\n\nSe você não pediu, ignore este e-mail: sua senha continua a mesma.`,
  });
}

export async function resetPassword(db: Db, token: string, newPassword: string, now = new Date()): Promise<void> {
  const password = Password.parse(newPassword);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt <= now) {
    throw badRequest('Link inválido ou expirado. Peça um novo.', 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    // updateMany com usedAt: null garante uso único mesmo com dois cliques simultâneos
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw badRequest('Link inválido ou expirado. Peça um novo.', 'INVALID_RESET_TOKEN');
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
  });
}
