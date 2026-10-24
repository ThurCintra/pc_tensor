import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createTestDb } from '@pc-tensor/db/testing';
import { signRealtimeToken, verifyRealtimeToken } from '@pc-tensor/protocol/realtime-token';
import { ApiError } from './errors';
import { RateLimiter } from './rate-limit';
import { sha256 } from './crypto';
import {
  RegisterInput,
  registerUser,
  requestPasswordReset,
  resetPassword,
  updateSettings,
  upsertOAuthUser,
  verifyCredentials,
} from './users';
import { createPairingCode, redeemPairingCode } from './pairing';
import { authenticateDevice, deleteDevice, getDevice, listDevices, listHistory, updateDevice } from './devices';
import type { Mail } from './mailer';

const { db, close } = await createTestDb();
afterAll(close);

beforeEach(async () => {
  await db.user.deleteMany();
});

const register = (email = 'arthur@example.com', password = 'senha-forte-123') =>
  registerUser(db, RegisterInput.parse({ name: 'Arthur', email, password }));

async function expectApiError(promise: Promise<unknown>, status: number, code?: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
  if (code) expect((err as ApiError).code).toBe(code);
}

describe('contas', () => {
  it('cadastra com e-mail normalizado e senha em Argon2id', async () => {
    const user = await registerUser(
      db,
      RegisterInput.parse({ name: ' Arthur ', email: ' Arthur@Example.COM ', password: 'senha-forte-123' }),
    );
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(user).toMatchObject({ name: 'Arthur', email: 'arthur@example.com', hasPassword: true, kwhTariff: 0.95 });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('recusa e-mail repetido e senha curta', async () => {
    await register();
    await expectApiError(register(), 409, 'EMAIL_TAKEN');
    expect(RegisterInput.safeParse({ name: 'A', email: 'a@b.com', password: 'curta' }).success).toBe(false);
  });

  it('entra com a senha certa e recusa a errada ou e-mail inexistente', async () => {
    const user = await register();
    expect((await verifyCredentials(db, 'ARTHUR@example.com', 'senha-forte-123'))?.id).toBe(user.id);
    expect(await verifyCredentials(db, 'arthur@example.com', 'senha-errada')).toBeNull();
    expect(await verifyCredentials(db, 'ninguem@example.com', 'senha-forte-123')).toBeNull();
  });

  it('login social cria a conta, reaproveita o vínculo e liga a um e-mail existente só se verificado', async () => {
    const oauth = {
      provider: 'google',
      providerAccountId: 'g-1',
      email: 'novo@example.com',
      emailVerified: true,
      name: 'Novo',
      image: null,
    };
    const created = await upsertOAuthUser(db, oauth);
    expect(created.hasPassword).toBe(false);
    expect((await upsertOAuthUser(db, oauth)).id).toBe(created.id);

    const existing = await register('arthur@example.com');
    const linked = await upsertOAuthUser(db, { ...oauth, providerAccountId: 'g-2', email: 'arthur@example.com' });
    expect(linked.id).toBe(existing.id);

    await expectApiError(
      upsertOAuthUser(db, {
        ...oauth,
        provider: 'github',
        providerAccountId: 'gh-9',
        email: 'arthur@example.com',
        emailVerified: false,
      }),
      400,
      'EMAIL_NOT_VERIFIED',
    );
  });

  it('atualiza nome e tarifa de energia', async () => {
    const user = await register();
    const updated = await updateSettings(db, user.id, { kwhTariff: 1.0567 });
    expect(updated.kwhTariff).toBe(1.0567);
  });
});

describe('recuperação de senha', () => {
  it('envia o link, troca a senha uma única vez e invalida o token', async () => {
    const user = await register();
    const mails: Mail[] = [];
    await requestPasswordReset(db, 'arthur@example.com', {
      mailer: async (m) => void mails.push(m),
      appUrl: 'https://pc.example',
    });

    expect(mails).toHaveLength(1);
    const token = decodeURIComponent(mails[0]!.text.match(/token=([^\s]+)/)![1]!);
    expect(token.startsWith('pct_reset_')).toBe(true);
    expect(await db.passwordResetToken.findFirst({ where: { tokenHash: token } })).toBeNull(); // só o hash no banco

    await resetPassword(db, token, 'nova-senha-segura');
    expect((await verifyCredentials(db, user.email, 'nova-senha-segura'))?.id).toBe(user.id);
    await expectApiError(resetPassword(db, token, 'outra-senha-segura'), 400, 'INVALID_RESET_TOKEN');
  });

  it('não revela se o e-mail existe e recusa link vencido', async () => {
    const mailer = vi.fn();
    await requestPasswordReset(db, 'ninguem@example.com', { mailer, appUrl: 'https://pc.example' });
    expect(mailer).not.toHaveBeenCalled();

    await register();
    const mails: Mail[] = [];
    const past = new Date(Date.now() - 2 * 3_600_000);
    await requestPasswordReset(db, 'arthur@example.com', {
      mailer: async (m) => void mails.push(m),
      appUrl: 'x',
      now: () => past,
    });
    const token = decodeURIComponent(mails[0]!.text.match(/token=([^\s]+)/)![1]!);
    await expectApiError(resetPassword(db, token, 'nova-senha-segura'), 400, 'INVALID_RESET_TOKEN');
  });
});

describe('pareamento de 6 dígitos', () => {
  const pc = { name: 'PC da sala', cpuModel: 'AMD Ryzen 5 9600X', gpuModel: 'AMD Radeon RX 7600', totalRamGb: 16 };

  it('troca o código pelo DeviceToken uma única vez', async () => {
    const user = await register();
    const { code, expiresAt } = await createPairingCode(db, user.id);
    expect(code).toMatch(/^\d{6}$/);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(4 * 60_000);

    const { deviceId, deviceToken } = await redeemPairingCode(db, { code, ...pc });
    expect(deviceToken).toMatch(/^pct_dev_/);
    const device = await db.device.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device).toMatchObject({ userId: user.id, name: 'PC da sala', deviceTokenHash: sha256(deviceToken) });

    await expectApiError(redeemPairingCode(db, { code, ...pc }), 400, 'INVALID_PAIRING_CODE');
    expect((await authenticateDevice(db, deviceToken))?.id).toBe(deviceId);
    expect(await authenticateDevice(db, 'pct_dev_falso')).toBeNull();
  });

  it('código vence em 5 minutos e gerar outro invalida o anterior', async () => {
    const user = await register();
    const old = await createPairingCode(db, user.id, new Date(Date.now() - 6 * 60_000));
    await expectApiError(redeemPairingCode(db, { code: old.code, ...pc }), 400);

    const first = await createPairingCode(db, user.id);
    const second = await createPairingCode(db, user.id);
    await expectApiError(redeemPairingCode(db, { code: first.code, ...pc }), 400);
    await expect(redeemPairingCode(db, { code: second.code, ...pc })).resolves.toHaveProperty('deviceToken');
  });

  it('dois PCs tentando o mesmo código ao mesmo tempo: só um consegue', async () => {
    const user = await register();
    const { code } = await createPairingCode(db, user.id);
    const results = await Promise.allSettled([
      redeemPairingCode(db, { code, ...pc }),
      redeemPairingCode(db, { code, ...pc }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.device.count()).toBe(1);
  });
});

describe('computadores', () => {
  async function pairedDevice(email = 'arthur@example.com') {
    const user = await register(email);
    const { code } = await createPairingCode(db, user.id);
    const { deviceId, deviceToken } = await redeemPairingCode(db, {
      code,
      name: 'PC',
      cpuModel: null,
      gpuModel: null,
      totalRamGb: null,
    });
    return { user, deviceId, deviceToken };
  }

  it('lista, configura e remove só os PCs do próprio usuário', async () => {
    const mine = await pairedDevice();
    const other = await pairedDevice('outra@example.com');

    expect((await listDevices(db, mine.user.id)).map((d) => d.id)).toEqual([mine.deviceId]);
    const updated = await updateDevice(db, mine.user.id, mine.deviceId, { name: 'Gamer', maxCpuTempAlert: 88 });
    expect(updated).toMatchObject({ name: 'Gamer', maxCpuTempAlert: 88, status: 'OFFLINE' });

    // PC de outra pessoa: 404, como se não existisse
    await expectApiError(getDevice(db, mine.user.id, other.deviceId), 404);
    await expectApiError(updateDevice(db, mine.user.id, other.deviceId, { name: 'x' }), 404);
    await expectApiError(deleteDevice(db, mine.user.id, other.deviceId), 404);

    await deleteDevice(db, mine.user.id, mine.deviceId);
    expect(await authenticateDevice(db, mine.deviceToken)).toBeNull();
  });

  it('status usa o último resumo gravado e o histórico respeita o período', async () => {
    const { user, deviceId } = await pairedDevice();
    await db.device.update({ where: { id: deviceId }, data: { isOnline: true } });
    await db.telemetryHistory.create({
      data: { deviceId, timestamp: new Date(), avgCpuTemp: 93, avgGpuTemp: 60, maxTemp: 95, energyConsumedWh: 3 },
    });

    expect((await getDevice(db, user.id, deviceId)).status).toBe('THERMAL_ALERT');
    expect(await listHistory(db, user.id, deviceId, 1)).toHaveLength(1);
    await expectApiError(listHistory(db, user.id, deviceId, 24 * 60), 400);
  });
});

describe('infraestrutura', () => {
  it('limita tentativas por chave e libera depois da janela', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 60_000, () => now);
    limiter.consume('ip');
    limiter.consume('ip');
    expect(() => limiter.consume('ip')).toThrow(/Tente de novo em 60 s/);
    limiter.consume('outro-ip');
    now = 60_001;
    expect(() => limiter.consume('ip')).not.toThrow();
  });

  it('token de tempo real: válido, vencido ou com segredo errado', async () => {
    const secret = 'x'.repeat(32);
    const token = await signRealtimeToken('user-1', secret);
    expect(await verifyRealtimeToken(token, secret)).toBe('user-1');
    expect(await verifyRealtimeToken(token, 'y'.repeat(32))).toBeNull();
    expect(
      await verifyRealtimeToken(await signRealtimeToken('user-1', secret, Date.now() - 10 * 60_000), secret),
    ).toBeNull();
    await expect(signRealtimeToken('u', 'curto')).rejects.toThrow(/32 caracteres/);
  });
});
