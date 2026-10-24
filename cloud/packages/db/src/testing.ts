import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from './generated/prisma/client';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');

/**
 * Banco PostgreSQL de verdade em memória (PGlite, WASM) com todas as migrações aplicadas.
 * Usado nos testes: nenhum servidor de banco é necessário e cada teste começa com o banco vazio.
 */
export async function createTestDb(): Promise<{ db: PrismaClient; close: () => Promise<void> }> {
  const pglite = new PGlite();
  for (const dir of readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    await pglite.exec(readFileSync(join(migrationsDir, dir.name, 'migration.sql'), 'utf8'));
  }
  const db = new PrismaClient({ adapter: new PrismaPGlite(pglite) });
  return {
    db,
    close: async () => {
      await db.$disconnect();
      await pglite.close();
    },
  };
}
