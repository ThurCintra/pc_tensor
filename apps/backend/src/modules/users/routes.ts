import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db.js';
import { users } from '../../db/schema.js';
import { AppError } from '../../errors.js';

export interface UserRouteOptions {
  db: Database;
}

export function userRoutes(app: FastifyInstance, options: UserRouteOptions): void {
  const { db } = options;

  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const userRows = await db.select().from(users).where(eq(users.id, request.userId));
    const found = userRows.at(0);
    if (found === undefined) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    return {
      user: { id: found.id, email: found.email, createdAt: found.createdAt },
    };
  });
}
