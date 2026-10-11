import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import type { Database } from './db.js';
import { AppError, errorHandler } from './errors.js';
import { authRoutes } from './modules/auth/routes.js';
import { userRoutes } from './modules/users/routes.js';
import './types.js';

export interface BuildAppOptions {
  config: AppConfig;
  pool: Pool;
  db: Database;
}

const accessTokenPayloadSchema = z
  .object({
    sub: z.uuid(),
  })
  .strict();

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, pool, db } = options;

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
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: '15m' },
  });

  app.decorate('authenticate', (request) => {
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing access token');
    }
    const token = header.slice('Bearer '.length).trim();
    let payload: unknown;
    try {
      payload = app.jwt.verify(token);
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid access token');
    }
    const parsed = accessTokenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid access token');
    }
    request.userId = parsed.data.sub;
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

  await app.register(authRoutes, { prefix: '/v1/auth', db });
  await app.register(userRoutes, { prefix: '/v1/users', db });

  return app;
}
