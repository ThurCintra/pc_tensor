import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  const app = await buildApp({ config, pool });

  const close = async (): Promise<void> => {
    await app.close();
    await pool.end();
  };
  process.on('SIGINT', () => {
    void close().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void close().finally(() => process.exit(0));
  });

  await app.listen({ host: config.HOST, port: config.PORT });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
