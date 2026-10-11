import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../db.js';
import { auditLog, refreshTokens, users } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import { randomTokenHex, sha256Hex } from '../../lib/crypto.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { LoginInput, RegisterInput } from './schemas.js';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  email: string;
  createdAt: Date;
}

type UserRow = typeof users.$inferSelect;

function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, createdAt: row.createdAt };
}

async function writeAudit(
  db: Database,
  action: string,
  userId: string | null,
): Promise<void> {
  await db.insert(auditLog).values({ action, userId, metadata: {} });
}

async function revokeFamily(db: Database, familyId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.familyId, familyId));
}

export async function register(db: Database, input: RegisterInput): Promise<PublicUser> {
  const existing = await db.select().from(users).where(eq(users.email, input.email));
  if (existing.length > 0) {
    throw new AppError(409, 'CONFLICT', 'Email already in use');
  }
  const passwordHash = await hashPassword(input.password);
  try {
    const createdRows = await db
      .insert(users)
      .values({ email: input.email, passwordHash })
      .returning();
    const created = createdRows.at(0);
    if (created === undefined) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create user');
    }
    await writeAudit(db, 'auth.register', created.id);
    return toPublicUser(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'CONFLICT', 'Email already in use');
    }
    throw error;
  }
}

export interface LoginResult {
  user: PublicUser;
  refreshToken: string;
}

export async function login(db: Database, input: LoginInput): Promise<LoginResult> {
  const userRows = await db.select().from(users).where(eq(users.email, input.email));
  const found = userRows.at(0);
  const valid = found !== undefined && (await verifyPassword(found.passwordHash, input.password));
  if (!valid) {
    await writeAudit(db, 'auth.login_failed', found?.id ?? null);
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }
  const refreshToken = randomTokenHex();
  await db.insert(refreshTokens).values({
    userId: found.id,
    familyId: randomUUID(),
    tokenHash: sha256Hex(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  await writeAudit(db, 'auth.login', found.id);
  return { user: toPublicUser(found), refreshToken };
}

export interface RefreshResult {
  userId: string;
  refreshToken: string;
}

export async function refresh(db: Database, presentedToken: string): Promise<RefreshResult> {
  const tokenHash = sha256Hex(presentedToken);
  const tokenRows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash));
  const row = tokenRows.at(0);
  if (row === undefined || row.revokedAt !== null || row.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
  }
  if (row.consumedAt !== null) {
    await revokeFamily(db, row.familyId);
    await writeAudit(db, 'auth.refresh_reuse', row.userId);
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
  }
  const nextToken = randomTokenHex();
  await db
    .update(refreshTokens)
    .set({ consumedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));
  await db.insert(refreshTokens).values({
    userId: row.userId,
    familyId: row.familyId,
    tokenHash: sha256Hex(nextToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { userId: row.userId, refreshToken: nextToken };
}

export async function logout(db: Database, presentedToken: string): Promise<void> {
  const tokenHash = sha256Hex(presentedToken);
  const tokenRows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash));
  const row = tokenRows.at(0);
  if (row === undefined) {
    return;
  }
  await revokeFamily(db, row.familyId);
  await writeAudit(db, 'auth.logout', row.userId);
}
