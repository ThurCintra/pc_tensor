import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db.js';
import { AppError } from '../../errors.js';
import { AttemptLimiter } from '../../lib/attempt-limiter.js';
import { login, logout, refresh, register } from './service.js';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from './schemas.js';

export interface AuthRouteOptions {
  db: Database;
}

const authLimiter = new AttemptLimiter(10, 10 * 60 * 1000);

function checkRateLimit(ip: string, email: string): void {
  const ipAllowed = authLimiter.take(`auth:ip:${ip}`);
  const emailAllowed = authLimiter.take(`auth:email:${email}`);
  if (!ipAllowed || !emailAllowed) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many attempts, try again later');
  }
}

export function authRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  const { db } = options;

  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    checkRateLimit(request.ip, parsed.data.email);
    const user = await register(db, parsed.data);
    return reply.status(201).send({ user });
  });

  app.post('/login', async (request) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    checkRateLimit(request.ip, parsed.data.email);
    const result = await login(db, parsed.data);
    const accessToken: string = app.jwt.sign({ sub: result.user.id });
    return { accessToken, refreshToken: result.refreshToken, user: result.user };
  });

  app.post('/refresh', async (request) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    const result = await refresh(db, parsed.data.refreshToken);
    const accessToken: string = app.jwt.sign({ sub: result.userId });
    return { accessToken, refreshToken: result.refreshToken };
  });

  app.post('/logout', async (request, reply) => {
    const parsed = logoutSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    await logout(db, parsed.data.refreshToken);
    return reply.status(204).send();
  });
}
