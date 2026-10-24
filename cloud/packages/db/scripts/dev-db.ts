/**
 * Banco de desenvolvimento local: PGlite (PostgreSQL em WASM) servido pelo protocolo do PostgreSQL, para o site
 * e o servidor de tempo real rodarem aqui sem instalar PostgreSQL nem Docker. Os dados ficam em
 * ~/.pc-tensor-cloud/pglite (ou em PGLITE_DIR).
 *
 *   npm run db:dev        → postgresql://postgres@127.0.0.1:5433/postgres
 *
 * Só para desenvolvimento: em produção use Neon, Supabase ou outro PostgreSQL.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const root = resolve(import.meta.dirname, '..');
// Fora do monorepo de propósito: o Turbopack observa cloud/ inteiro, e cada escrita do banco (WAL) dentro dele
// recompilava o site e recarregava a página, que consultava o banco de novo, num ciclo sem fim
const dataDir = process.env.PGLITE_DIR ?? join(homedir(), '.pc-tensor-cloud', 'pglite');
const port = Number(process.env.PGLITE_PORT ?? 5433);

const db = await PGlite.create(dataDir);

// Aplica as migrações que ainda não rodaram (mesma tabela de controle do prisma migrate)
await db.exec(
  `CREATE TABLE IF NOT EXISTS "_dev_migrations" (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`,
);
const applied = new Set(
  (await db.query<{ name: string }>('SELECT name FROM "_dev_migrations"')).rows.map((r) => r.name),
);
const migrationsDir = join(root, 'prisma', 'migrations');
for (const dir of readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))) {
  if (applied.has(dir.name)) continue;
  await db.exec(readFileSync(join(migrationsDir, dir.name, 'migration.sql'), 'utf8'));
  await db.query('INSERT INTO "_dev_migrations" (name) VALUES ($1)', [dir.name]);
  console.log(`[db:dev] migração aplicada: ${dir.name}`);
}

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`[db:dev] PostgreSQL local em postgresql://postgres@127.0.0.1:${port}/postgres (dados em ${dataDir})`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
