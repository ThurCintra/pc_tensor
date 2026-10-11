import type { FastifyInstance } from 'fastify';
import { Client, type Pool } from 'pg';
import { afterAll, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool, type Database } from '../src/db.js';
import { migrate } from '../src/db/migrate.js';

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  pool: Pool;
}

const TEST_DATABASE_URL =
  process.env['DATABASE_URL_TEST'] ??
  'postgres://pcsentinel:pcsentinel_dev_password@localhost:5432/pcsentinel_test';

async function ensureDatabase(databaseUrl: string): Promise<void> {
  const parsed = new URL(databaseUrl);
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(`Unsafe test database name: ${dbName}`);
  }
  parsed.pathname = '/postgres';
  const admin = new Client({ connectionString: parsed.toString() });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE "user", refresh_token, computer, agent_credential, pairing_code, computer_session, audit_log, metric_sample CASCADE',
  );
}

let context: TestContext | undefined;

export function testContext(): TestContext {
  if (context === undefined) {
    throw new Error('Test context not initialized');
  }
  return context;
}

export function setupTestApp(): void {
  beforeAll(async () => {
    await ensureDatabase(TEST_DATABASE_URL);
    await migrate(TEST_DATABASE_URL);
    const pool = createPool(TEST_DATABASE_URL);
    const db = createDb(pool);
    await truncateAll(pool);
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-jwt-secret-0123456789abcdef',
      CORS_ORIGIN: 'http://localhost:3000',
      RATE_LIMIT_MAX: '1000',
      LOG_LEVEL: 'warn',
    });
    const app = await buildApp({ config, pool, db });
    context = { app, db, pool };
  });

  afterAll(async () => {
    await context?.app.close();
    await context?.pool.end();
    context = undefined;
  });
}

let counter = 0;

export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(Date.now())}-${String(counter)}@example.com`;
}

export interface TestUser {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export async function registerUser(prefix: string): Promise<TestUser> {
  const { app } = testContext();
  const email = uniqueEmail(prefix);
  const password = 'correct-horse-10';
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password },
  });
  if (registerResponse.statusCode !== 201) {
    throw new Error(`Failed to register test user: ${registerResponse.body}`);
  }
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  });
  if (loginResponse.statusCode !== 200) {
    throw new Error(`Failed to login test user: ${loginResponse.body}`);
  }
  const body = loginResponse.json<{
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  }>();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken, userId: body.user.id };
}

export function authHeaders(user: TestUser): { authorization: string } {
  return { authorization: `Bearer ${user.accessToken}` };
}
