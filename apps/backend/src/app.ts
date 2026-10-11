import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { AppConfig } from './config.js';
import { AppError, errorHandler } from './errors.js';

export interface BuildAppOptions {
  config: AppConfig;
  pool: Pool;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, pool } = options;

  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigins,
  });
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    errorResponseBuilder: () => ({
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    }),
  });

  app.setErrorHandler(errorHandler);

  app.get('/v1/health', async () => {
    try {
      await pool.query('SELECT 1');
    } catch {
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Database unreachable');
    }
    return { status: 'ok' };
  });

  return app;
}
