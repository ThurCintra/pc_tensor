import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db.js';
import { AppError } from '../../errors.js';
import { AttemptLimiter } from '../../lib/attempt-limiter.js';
import { getComputer, listComputers, renameComputer, unlinkComputer } from './service.js';
import { linkComputer } from '../pairing/service.js';

export interface ComputerRouteOptions {
  db: Database;
}

const computerIdSchema = z.uuid();
const linkSchema = z
  .object({
    code: z.string().min(1).max(32),
  })
  .strict();
const renameSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

function parseId(raw: string): string {
  if (!computerIdSchema.safeParse(raw).success) {
    throw new AppError(404, 'NOT_FOUND', 'Computer not found');
  }
  return raw;
}

export function computerRoutes(app: FastifyInstance, options: ComputerRouteOptions): void {
  const { db } = options;
  const linkLimiter = new AttemptLimiter(5, 10 * 60 * 1000);

  app.post('/link', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = linkSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    const userKey = `link:user:${request.userId}`;
    const ipKey = `link:ip:${request.ip}`;
    if (linkLimiter.isLimited(userKey) || linkLimiter.isLimited(ipKey)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many attempts, try again later');
    }
    try {
      const computer = await linkComputer(db, request.userId, parsed.data.code);
      return await reply.status(201).send({ computer });
    } catch (error) {
      if (error instanceof AppError && (error.statusCode === 404 || error.statusCode === 410)) {
        linkLimiter.take(userKey);
        linkLimiter.take(ipKey);
      }
      throw error;
    }
  });

  app.get('/', { preHandler: app.authenticate }, async (request) => {
    const result = await listComputers(db, request.userId);
    return { computers: result };
  });

  app.get('/:id', { preHandler: app.authenticate }, async (request) => {
    const params = request.params as { id: string };
    const computer = await getComputer(db, request.userId, parseId(params.id));
    if (computer === undefined) {
      throw new AppError(404, 'NOT_FOUND', 'Computer not found');
    }
    return { computer };
  });

  app.patch('/:id', { preHandler: app.authenticate }, async (request) => {
    const params = request.params as { id: string };
    const parsed = renameSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    const computer = await renameComputer(db, request.userId, parseId(params.id), parsed.data.name);
    return { computer };
  });

  app.delete('/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { id: string };
    await unlinkComputer(db, request.userId, parseId(params.id));
    return reply.status(204).send();
  });
}
