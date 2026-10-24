import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** Token aleatório de 256 bits em base64url, com prefixo que identifica o tipo (ajuda a achar vazamentos). */
export function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

/** Tokens de alta entropia são guardados só como SHA-256 (rápido de verificar e inútil se o banco vazar). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Código numérico de 6 dígitos com distribuição uniforme (randomInt usa o gerador criptográfico). */
export function sixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Senhas: Argon2id com os parâmetros recomendados pela OWASP (19 MiB, 2 iterações)
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false; // hash corrompido ou de outro formato
  }
}

/** Hash fixo para comparar quando o e-mail não existe: a resposta leva o mesmo tempo e não revela contas. */
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('senha-que-nunca-confere');
  await verifyPassword(await dummyHash, password);
  return false;
}
