import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db.js';
import { agentCredentials, auditLog, computers, pairingCodes } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import { generatePairingCode, randomTokenHex, safeEqualHex, sha256Hex } from '../../lib/crypto.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { storePendingToken, takePendingToken } from './pending-tokens.js';

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

const pairingIdSchema = z.uuid();
const pairingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

export interface CreatePairingResult {
  pairingId: string;
  code: string;
  pollSecret: string;
  expiresAt: Date;
}

export async function createPairing(
  db: Database,
  nameHint: string | undefined,
): Promise<CreatePairingResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generatePairingCode();
    const pollSecret = randomTokenHex();
    try {
      const rows = await db
        .insert(pairingCodes)
        .values({
          codeHash: sha256Hex(code),
          pollSecretHash: sha256Hex(pollSecret),
          nameHint: nameHint ?? null,
          expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
        })
        .returning({ id: pairingCodes.id, expiresAt: pairingCodes.expiresAt });
      const created = rows.at(0);
      if (created === undefined) {
        throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create pairing code');
      }
      return { pairingId: created.id, code, pollSecret, expiresAt: created.expiresAt };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
  throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create pairing code');
}

export type PairingStatus =
  | { status: 'pending'; expiresAt: Date }
  | { status: 'linked'; computerId: string; agentToken: string };

export async function getPairingStatus(
  db: Database,
  pairingId: string,
  pollSecret: string,
): Promise<PairingStatus> {
  if (!pairingIdSchema.safeParse(pairingId).success) {
    throw new AppError(404, 'NOT_FOUND', 'Pairing not found');
  }
  const rows = await db.select().from(pairingCodes).where(eq(pairingCodes.id, pairingId));
  const pairing = rows.at(0);
  if (pairing === undefined) {
    throw new AppError(404, 'NOT_FOUND', 'Pairing not found');
  }
  if (!safeEqualHex(sha256Hex(pollSecret), pairing.pollSecretHash)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid poll secret');
  }
  if (pairing.expiresAt.getTime() <= Date.now()) {
    throw new AppError(410, 'PAIRING_EXPIRED', 'Pairing code expired');
  }
  if (pairing.computerId === null) {
    return { status: 'pending', expiresAt: pairing.expiresAt };
  }
  const pending = takePendingToken(pairing.id);
  if (pending === undefined) {
    throw new AppError(410, 'PAIRING_EXPIRED', 'Pairing token no longer available, pair again');
  }
  await db.delete(pairingCodes).where(eq(pairingCodes.id, pairing.id));
  return { status: 'linked', computerId: pending.computerId, agentToken: pending.agentToken };
}

export interface LinkedComputer {
  id: string;
  name: string;
  hostname: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
}

export async function linkComputer(
  db: Database,
  userId: string,
  code: string,
): Promise<LinkedComputer> {
  const normalized = pairingCodeSchema.safeParse(code);
  if (!normalized.success) {
    throw new AppError(404, 'NOT_FOUND', 'Invalid pairing code');
  }
  const rows = await db
    .select()
    .from(pairingCodes)
    .where(eq(pairingCodes.codeHash, sha256Hex(normalized.data)));
  const pairing = rows.at(0);
  if (pairing === undefined) {
    throw new AppError(404, 'NOT_FOUND', 'Invalid pairing code');
  }
  if (pairing.consumedAt !== null) {
    throw new AppError(410, 'PAIRING_CONSUMED', 'Pairing code already used');
  }
  if (pairing.expiresAt.getTime() <= Date.now()) {
    throw new AppError(410, 'PAIRING_EXPIRED', 'Pairing code expired');
  }

  const computerRows = await db
    .insert(computers)
    .values({
      userId,
      name: pairing.nameHint ?? 'My computer',
      hostname: pairing.nameHint,
    })
    .returning();
  const computer = computerRows.at(0);
  if (computer === undefined) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to link computer');
  }

  const agentToken = randomTokenHex();
  await db.insert(agentCredentials).values({
    computerId: computer.id,
    tokenHash: sha256Hex(agentToken),
  });
  await db
    .update(pairingCodes)
    .set({ userId, computerId: computer.id, consumedAt: new Date() })
    .where(eq(pairingCodes.id, pairing.id));
  storePendingToken(pairing.id, { computerId: computer.id, agentToken });

  await db.insert(auditLog).values({ action: 'computer.linked', userId, metadata: {} });

  return {
    id: computer.id,
    name: computer.name,
    hostname: computer.hostname,
    createdAt: computer.createdAt,
    lastSeenAt: computer.lastSeenAt,
  };
}
