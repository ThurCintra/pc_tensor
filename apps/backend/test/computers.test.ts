import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { agentCredentials } from '../src/db/schema.js';
import { authHeaders, registerUser, setupTestApp, testContext, truncateAll } from './helper.js';

setupTestApp();

describe('computers', () => {
  it('lists, reads, renames and deletes computers', async () => {
    const { app, db, pool } = testContext();
    await truncateAll(pool);
    const user = await registerUser('computers');

    const pairing = await app.inject({
      method: 'POST',
      url: '/v1/agent/pairing',
      payload: { nameHint: 'Office PC' },
    });
    const { code } = pairing.json<{ code: string }>();
    const link = await app.inject({
      method: 'POST',
      url: '/v1/computers/link',
      headers: authHeaders(user),
      payload: { code },
    });
    expect(link.statusCode).toBe(201);
    const { computer } = link.json<{ computer: { id: string; name: string } }>();

    const list = await app.inject({
      method: 'GET',
      url: '/v1/computers',
      headers: authHeaders(user),
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json<{ computers: { id: string }[] }>();
    expect(listed.computers.map((entry) => entry.id)).toContain(computer.id);

    const read = await app.inject({
      method: 'GET',
      url: `/v1/computers/${computer.id}`,
      headers: authHeaders(user),
    });
    expect(read.statusCode).toBe(200);

    const rename = await app.inject({
      method: 'PATCH',
      url: `/v1/computers/${computer.id}`,
      headers: authHeaders(user),
      payload: { name: 'Renamed PC' },
    });
    expect(rename.statusCode).toBe(200);
    const renamed = rename.json<{ computer: { name: string } }>();
    expect(renamed.computer.name).toBe('Renamed PC');

    const remove = await app.inject({
      method: 'DELETE',
      url: `/v1/computers/${computer.id}`,
      headers: authHeaders(user),
    });
    expect(remove.statusCode).toBe(204);

    const readAfterDelete = await app.inject({
      method: 'GET',
      url: `/v1/computers/${computer.id}`,
      headers: authHeaders(user),
    });
    expect(readAfterDelete.statusCode).toBe(404);

    const credentials = await db
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.computerId, computer.id));
    expect(credentials).toHaveLength(0);
  });

  it('prevents user B from accessing user A computers', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    const userA = await registerUser('owner');
    const userB = await registerUser('intruder');

    const pairing = await app.inject({
      method: 'POST',
      url: '/v1/agent/pairing',
      payload: { nameHint: 'Private PC' },
    });
    const { code } = pairing.json<{ code: string }>();
    const link = await app.inject({
      method: 'POST',
      url: '/v1/computers/link',
      headers: authHeaders(userA),
      payload: { code },
    });
    const { computer } = link.json<{ computer: { id: string } }>();

    const read = await app.inject({
      method: 'GET',
      url: `/v1/computers/${computer.id}`,
      headers: authHeaders(userB),
    });
    expect(read.statusCode).toBe(404);

    const rename = await app.inject({
      method: 'PATCH',
      url: `/v1/computers/${computer.id}`,
      headers: authHeaders(userB),
      payload: { name: 'Hacked' },
    });
    expect(rename.statusCode).toBe(404);

    const remove = await app.inject({
      method: 'DELETE',
      url: `/v1/computers/${computer.id}`,
      headers: authHeaders(userB),
    });
    expect(remove.statusCode).toBe(404);

    const ownerRead = await app.inject({
      method: 'GET',
      url: `/v1/computers/${computer.id}`,
      headers: authHeaders(userA),
    });
    expect(ownerRead.statusCode).toBe(200);

    const otherList = await app.inject({
      method: 'GET',
      url: '/v1/computers',
      headers: authHeaders(userB),
    });
    const listed = otherList.json<{ computers: { id: string }[] }>();
    expect(listed.computers.map((entry) => entry.id)).not.toContain(computer.id);
  });

  it('returns 404 for malformed ids and 401 without auth', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    const user = await registerUser('malformed');

    const malformed = await app.inject({
      method: 'GET',
      url: '/v1/computers/not-a-uuid',
      headers: authHeaders(user),
    });
    expect(malformed.statusCode).toBe(404);

    const unauthenticated = await app.inject({ method: 'GET', url: '/v1/computers' });
    expect(unauthenticated.statusCode).toBe(401);
  });
});
