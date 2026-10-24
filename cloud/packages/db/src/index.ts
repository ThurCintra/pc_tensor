import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export { PrismaClient, Prisma } from './generated/prisma/client';
export type { User, Device, PairingCode, TelemetryHistory, AlertEvent, Account } from './generated/prisma/client';
export { AlertType } from './generated/prisma/enums';

export type Db = PrismaClient;

/**
 * Conexão com o PostgreSQL (Neon, Supabase, RDS…). Em serverless use a URL com pool do provedor
 * (ex.: o host "-pooler" do Neon) para não estourar o limite de conexões.
 */
export function createDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) throw new Error('DATABASE_URL não definida.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Uma instância por processo (o Next.js em dev recarrega módulos e abriria conexões novas a cada edição). */
const globalForDb = globalThis as unknown as { pcTensorDb?: Db };

export function getDb(): Db {
  globalForDb.pcTensorDb ??= createDb();
  return globalForDb.pcTensorDb;
}
