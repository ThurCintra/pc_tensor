import { createDb } from '@pc-tensor/db';
import { createRealtimeServer } from './server';
import { createPrismaStore } from './store';

/**
 * Servidor de tempo real do pc_tensor Cloud.
 * Variáveis: DATABASE_URL, REALTIME_JWT_SECRET (o mesmo do site), CORS_ORIGINS (origens do site, separadas por
 * vírgula) e PORT (padrão 4000). Hospede onde conexões WebSocket longas são permitidas (Railway, Render, Fly.io).
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[realtime] Variável ${name} não definida.`);
    process.exit(1);
  }
  return value;
}

const db = createDb(required('DATABASE_URL'));
const server = createRealtimeServer({
  store: createPrismaStore(db),
  jwtSecret: required('REALTIME_JWT_SECRET'),
  corsOrigins: required('CORS_ORIGINS')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
});

const port = await server.listen(Number(process.env.PORT ?? 4000));
console.info(`[realtime] Ouvindo na porta ${port}`);

async function shutdown(signal: string) {
  console.info(`[realtime] ${signal}: encerrando`);
  await server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
