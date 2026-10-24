import type { Db } from '@pc-tensor/db';
import { PAIRING_CODE_TTL_MS, type PairRequest, type PairResponse } from '@pc-tensor/protocol';
import { randomToken, sha256, sixDigitCode } from './crypto';
import { badRequest, conflict } from './errors';

const MAX_DEVICES_PER_USER = 50;
const MAX_CODE_ATTEMPTS = 10;

/**
 * "Adicionar computador": gera um código de 6 dígitos válido por 5 minutos. Gerar outro invalida o anterior
 * do mesmo usuário, e o código nunca colide com outro código ativo (de qualquer usuário).
 */
export async function createPairingCode(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ code: string; expiresAt: string }> {
  const devices = await db.device.count({ where: { userId } });
  if (devices >= MAX_DEVICES_PER_USER) throw conflict(`Limite de ${MAX_DEVICES_PER_USER} computadores por conta.`);

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = sixDigitCode();
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);

    const created = await db.$transaction(async (tx) => {
      const active = await tx.pairingCode.findFirst({ where: { code, used: false, expiresAt: { gt: now } } });
      if (active) return null; // colisão com um código ativo: tenta outro
      await tx.pairingCode.updateMany({ where: { userId, used: false }, data: { used: true } });
      return tx.pairingCode.create({ data: { code, userId, expiresAt } });
    });
    if (created) return { code: created.code, expiresAt: created.expiresAt.toISOString() };
  }
  throw conflict('Não foi possível gerar um código agora. Tente de novo.');
}

/**
 * O agente no PC troca o código pelo DeviceToken definitivo. O token é devolvido uma única vez (o banco
 * guarda só o SHA-256) e o código é consumido na mesma transação: dois PCs nunca usam o mesmo código.
 */
export async function redeemPairingCode(db: Db, input: PairRequest, now = new Date()): Promise<PairResponse> {
  const deviceToken = randomToken('pct_dev');

  const device = await db.$transaction(async (tx) => {
    const pairing = await tx.pairingCode.findFirst({
      where: { code: input.code, used: false, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pairing) throw badRequest('Código inválido ou expirado. Gere outro no site.', 'INVALID_PAIRING_CODE');

    const claimed = await tx.pairingCode.updateMany({ where: { id: pairing.id, used: false }, data: { used: true } });
    if (claimed.count !== 1)
      throw badRequest('Código inválido ou expirado. Gere outro no site.', 'INVALID_PAIRING_CODE');

    return tx.device.create({
      data: {
        userId: pairing.userId,
        name: input.name,
        deviceTokenHash: sha256(deviceToken),
        cpuModel: input.cpuModel,
        gpuModel: input.gpuModel,
        totalRamGb: input.totalRamGb,
        lastSeenAt: now,
      },
    });
  });

  return { deviceId: device.id, deviceToken };
}

/** Limpeza periódica: códigos vencidos há mais de um dia. */
export async function purgeExpiredCodes(db: Db, now = new Date()): Promise<number> {
  const result = await db.pairingCode.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } },
  });
  return result.count;
}
