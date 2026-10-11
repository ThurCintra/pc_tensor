import { eq } from 'drizzle-orm';
import type { Database } from '../../db.js';
import { agentCredentials, auditLog, computers } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import type { LinkedComputer } from '../pairing/service.js';

export type PublicComputer = LinkedComputer;

function toPublicComputer(row: typeof computers.$inferSelect): PublicComputer {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export async function listComputers(db: Database, userId: string): Promise<PublicComputer[]> {
  const rows = await db.select().from(computers).where(eq(computers.userId, userId));
  return rows.map(toPublicComputer);
}

export async function getComputer(
  db: Database,
  userId: string,
  computerId: string,
): Promise<PublicComputer | undefined> {
  const rows = await db.select().from(computers).where(eq(computers.id, computerId));
  const found = rows.at(0);
  if (found === undefined || found.userId !== userId) {
    return undefined;
  }
  return toPublicComputer(found);
}

export async function renameComputer(
  db: Database,
  userId: string,
  computerId: string,
  name: string,
): Promise<PublicComputer> {
  const existing = await getComputer(db, userId, computerId);
  if (existing === undefined) {
    throw new AppError(404, 'NOT_FOUND', 'Computer not found');
  }
  const rows = await db
    .update(computers)
    .set({ name })
    .where(eq(computers.id, computerId))
    .returning();
  const updated = rows.at(0);
  if (updated === undefined) {
    throw new AppError(404, 'NOT_FOUND', 'Computer not found');
  }
  return toPublicComputer(updated);
}

export async function unlinkComputer(
  db: Database,
  userId: string,
  computerId: string,
): Promise<void> {
  const existing = await getComputer(db, userId, computerId);
  if (existing === undefined) {
    throw new AppError(404, 'NOT_FOUND', 'Computer not found');
  }
  await db
    .update(agentCredentials)
    .set({ revokedAt: new Date() })
    .where(eq(agentCredentials.computerId, computerId));
  await db.delete(computers).where(eq(computers.id, computerId));
  await db.insert(auditLog).values({ action: 'computer.unlinked', userId, metadata: {} });
}
