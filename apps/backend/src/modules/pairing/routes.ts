import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db.js';
import { AppError } from '../../errors.js';
import { createPairing, getPairingStatus } from './service.js';

export interface PairingRouteOptions {
  db: Database;
}

const createPairingSchema = z
  .object({
    nameHint: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export function pairingRoutes(app: FastifyInstance, options: PairingRouteOptions): void {
  const { db } = options;

  app.post('/pairing', async (request, reply) => {
    const parsed = createPairingSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    const result = await createPairing(db, parsed.data.nameHint);
    return reply.status(201).send({
      pairingId: result.pairingId,
      code: result.code,
      pollSecret: result.pollSecret,
      expiresAt: result.expiresAt.toISOString(),
    });
  });

  app.get('/pairing/:pairingId', async (request) => {
    const params = request.params as { pairingId: string };
    const header = request.headers['x-poll-secret'];
    const pollSecret = Array.isArray(header) ? header.at(0) : header;
    if (pollSecret === undefined || pollSecret === '') {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing poll secret');
    }
    const result = await getPairingStatus(db, params.pairingId, pollSecret);
    if (result.status === 'pending') {
      return { status: 'pending', expiresAt: result.expiresAt.toISOString() };
    }
    return { status: 'linked', computerId: result.computerId, agentToken: result.agentToken };
  });
}
