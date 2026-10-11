import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { agentCredentials, pairingCodes } from '../src/db/schema.js';
import { authHeaders, registerUser, setupTestApp, testContext, truncateAll } from './helper.js';

setupTestApp();

interface PairingCreated {
  pairingId: string;
  code: string;
  pollSecret: string;
  expiresAt: string;
}

async function createPairing(nameHint?: string): Promise<PairingCreated> {
  const { app } = testContext();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/agent/pairing',
    payload: nameHint === undefined ? {} : { nameHint },
  });
  expect(response.statusCode).toBe(201);
  return response.json<PairingCreated>();
}

describe('pairing', () => {
  it('completes the full pairing flow and delivers the agent token once', async () => {
    const { app, db, pool } = testContext();
    await truncateAll(pool);
    const user = await registerUser('pairing');

    const pairing = await createPairing('Test PC');

    const pending = await app.inject({
      method: 'GET',
      url: `/v1/agent/pairing/${pairing.pairingId}`,
      headers: { 'x-poll-secret': pairing.pollSecret },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toMatchObject({ status: 'pending' });

    const link = await app.inject({
      method: 'POST',
      url: '/v1/computers/link',
      headers: authHeaders(user),
      payload: { code: pairing.code },
    });
    expect(link.statusCode).toBe(201);
    const linked = link.json<{ computer: { id: string; name: string } }>();
    expect(linked.computer.name).toBe('Test PC');

    const credentialRows = await db
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.computerId, linked.computer.id));
    expect(credentialRows).toHaveLength(1);

    const delivered = await app.inject({
      method: 'GET',
      url: `/v1/agent/pairing/${pairing.pairingId}`,
      headers: { 'x-poll-secret': pairing.pollSecret },
    });
    expect(delivered.statusCode).toBe(200);
    const deliveredBody = delivered.json<{
      status: string;
      computerId: string;
      agentToken: string;
    }>();
    expect(deliveredBody.status).toBe('linked');
    expect(deliveredBody.computerId).toBe(linked.computer.id);
    expect(typeof deliveredBody.agentToken).toBe('string');

    const storedHash = credentialRows.at(0)?.tokenHash;
    expect(storedHash).toBeDefined();
    expect(storedHash).not.toBe(deliveredBody.agentToken);
    expect(storedHash).toBe(createHash('sha256').update(deliveredBody.agentToken).digest('hex'));

    const secondPoll = await app.inject({
      method: 'GET',
      url: `/v1/agent/pairing/${pairing.pairingId}`,
      headers: { 'x-poll-secret': pairing.pollSecret },
    });
    expect(secondPoll.statusCode).toBe(404);
  });

  it('rejects expired, reused and unknown codes', async () => {
    const { app, db, pool } = testContext();
    await truncateAll(pool);
    const user = await registerUser('pairing-expired');

    const pairing = await createPairing();
    await db
      .update(pairingCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pairingCodes.id, pairing.pairingId));

    const expiredLink = await app.inject({
      method: 'POST',
      url: '/v1/computers/link',
      headers: authHeaders(user),
      payload: { code: pairing.code },
    });
    expect(expiredLink.statusCode).toBe(410);

    const expiredPoll = await app.inject({
      method: 'GET',
      url: `/v1/agent/pairing/${pairing.pairingId}`,
      headers: { 'x-poll-secret': pairing.pollSecret },
    });
    expect(expiredPoll.statusCode).toBe(410);

    const fresh = await createPairing();
    const firstLink = await app.inject({
      method: 'POST',
      url: '/v1/computers/link',
      headers: authHeaders(user),
      payload: { code: fresh.code },
    });
    expect(firstLink.statusCode).toBe(201);

    const reusedLink = await app.inject({
      method: 'POST',
      url: '/v1/computers/link',
      headers: authHeaders(user),
      payload: { code: fresh.code },
    });
    expect(reusedLink.statusCode).toBe(410);

    const unknownLink = await app.inject({
      method: 'POST',
      url: '/v1/computers/link',
      headers: authHeaders(user),
      payload: { code: 'AAAA-BBBB' },
    });
    expect(unknownLink.statusCode).toBe(404);
  });

  it('rejects a wrong poll secret', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    await registerUser('pairing-poll');

    const pairing = await createPairing();

    const wrongSecret = await app.inject({
      method: 'GET',
      url: `/v1/agent/pairing/${pairing.pairingId}`,
      headers: { 'x-poll-secret': 'wrong-secret' },
    });
    expect(wrongSecret.statusCode).toBe(401);

    const missingSecret = await app.inject({
      method: 'GET',
      url: `/v1/agent/pairing/${pairing.pairingId}`,
    });
    expect(missingSecret.statusCode).toBe(401);

    const unknownPairing = await app.inject({
      method: 'GET',
      url: '/v1/agent/pairing/123e4567-e89b-12d3-a456-426614174000',
      headers: { 'x-poll-secret': pairing.pollSecret },
    });
    expect(unknownPairing.statusCode).toBe(404);
  });

  it('rate limits invalid link attempts', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    const user = await registerUser('pairing-limit');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/computers/link',
        headers: authHeaders(user),
        payload: { code: 'AAAA-BBBB' },
      });
      expect(response.statusCode).toBe(404);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/v1/computers/link',
      headers: authHeaders(user),
      payload: { code: 'AAAA-BBBB' },
    });
    expect(limited.statusCode).toBe(429);
  });
});
