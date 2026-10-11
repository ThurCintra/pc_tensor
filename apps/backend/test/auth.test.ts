import { describe, expect, it } from 'vitest';
import { setupTestApp, testContext, truncateAll, uniqueEmail } from './helper.js';

setupTestApp();

const PASSWORD = 's3cure-password';

describe('auth', () => {
  it('registers a user and exposes the profile', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    const email = uniqueEmail('register');

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    expect(registerResponse.statusCode).toBe(201);
    const registered = registerResponse.json<{ user: { id: string; email: string } }>();
    expect(registered.user.email).toBe(email);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(loginResponse.statusCode).toBe(200);
    const session = loginResponse.json<{
      accessToken: string;
      refreshToken: string;
      user: { id: string };
    }>();
    expect(typeof session.accessToken).toBe('string');
    expect(typeof session.refreshToken).toBe('string');

    const meResponse = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(meResponse.statusCode).toBe(200);
    const me = meResponse.json<{ user: { id: string; email: string } }>();
    expect(me.user.id).toBe(session.user.id);
    expect(me.user.email).toBe(email);
  });

  it('rejects short passwords and duplicate emails', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    const email = uniqueEmail('duplicate');

    const shortPassword = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: uniqueEmail('short'), password: 'short' },
    });
    expect(shortPassword.statusCode).toBe(400);

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('rejects invalid credentials with a generic message', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    const email = uniqueEmail('login');
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'wrong-password-1' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    });

    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: uniqueEmail('unknown'), password: 'wrong-password-1' },
    });
    expect(unknownEmail.statusCode).toBe(401);
    expect(unknownEmail.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    });
  });

  it('rotates refresh tokens', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    const email = uniqueEmail('rotation');
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const first = loginResponse.json<{ accessToken: string; refreshToken: string }>();

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(refreshResponse.statusCode).toBe(200);
    const second = refreshResponse.json<{ accessToken: string; refreshToken: string }>();
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const meResponse = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(meResponse.statusCode).toBe(200);
  });

  it('revokes the whole family when a refresh token is reused', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);
    const email = uniqueEmail('reuse');
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const first = loginResponse.json<{ accessToken: string; refreshToken: string }>();

    const rotated = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    const second = rotated.json<{ accessToken: string; refreshToken: string }>();

    const reuse = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);

    const afterReuse = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: second.refreshToken },
    });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('logs out and rejects further refreshes', async () => {
    const { app, db, pool } = testContext();
    await truncateAll(pool);
    const email = uniqueEmail('logout');
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'wrong-password-1' },
    });
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const session = loginResponse.json<{ accessToken: string; refreshToken: string }>();

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken: session.refreshToken },
    });
    expect(logoutResponse.statusCode).toBe(204);

    const refreshAfterLogout = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(refreshAfterLogout.statusCode).toBe(401);

    const auditRows = await db.execute(
      "SELECT action FROM audit_log WHERE action LIKE 'auth.%' ORDER BY created_at",
    );
    const actions = auditRows.rows.map((row) => (row as { action: string }).action);
    expect(actions).toContain('auth.login');
    expect(actions).toContain('auth.logout');
    expect(actions).toContain('auth.login_failed');
  });

  it('rejects unauthenticated profile access', async () => {
    const { app, pool } = testContext();
    await truncateAll(pool);

    const missing = await app.inject({ method: 'GET', url: '/v1/users/me' });
    expect(missing.statusCode).toBe(401);

    const invalid = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: 'Bearer invalid-token' },
    });
    expect(invalid.statusCode).toBe(401);
  });
});
