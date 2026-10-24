import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { createHash, randomBytes } from 'node:crypto';
import { createTestDb } from '@pc-tensor/db/testing';
import { signRealtimeToken } from '@pc-tensor/protocol/realtime-token';
import type { LiveFrame } from '@pc-tensor/protocol';
import { createRealtimeServer } from './server';
import { createPrismaStore } from './store';
import { PresenceTracker } from './presence';
import { assessDisconnect } from './crash';

const SECRET = 's'.repeat(40);
const { db, close: closeDb } = await createTestDb();
let server: ReturnType<typeof createRealtimeServer>;
let url = '';
const sockets: ClientSocket[] = [];

const quiet = { info: () => {}, warn: () => {}, error: () => {} };

beforeAll(async () => {
  server = createRealtimeServer({
    store: createPrismaStore(db),
    jwtSecret: SECRET,
    corsOrigins: ['http://localhost:3000'],
    crashGraceMs: 300,
    minFrameIntervalMs: 0,
    alertCooldownMs: 60_000,
    pingIntervalMs: 200,
    pingTimeoutMs: 200,
    log: quiet,
  });
  url = `http://127.0.0.1:${await server.listen(0, '127.0.0.1')}`;
});

afterAll(async () => {
  await server.close();
  await closeDb();
});

beforeEach(async () => {
  await db.user.deleteMany();
});

afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});

async function createDevice(email: string) {
  const user = await db.user.create({ data: { name: 'Teste', email } });
  const token = `pct_dev_${randomBytes(32).toString('base64url')}`;
  const device = await db.device.create({
    data: { userId: user.id, name: 'PC', deviceTokenHash: createHash('sha256').update(token).digest('hex') },
  });
  return { userId: user.id, deviceId: device.id, token };
}

function open(namespace: '/agent' | '/client', token: string): Promise<ClientSocket> {
  const socket = connect(url + namespace, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

const nextEvent = <T>(socket: ClientSocket, event: string, timeoutMs = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`sem evento ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const frame = (overrides: Partial<LiveFrame> = {}): LiveFrame => ({
  ts: Date.now(),
  profile: 'AAA_GAMING',
  cpu: { tempC: 72, loadPct: 85, powerW: 90 },
  gpu: { tempC: 70, loadPct: 98, powerW: 160 },
  extra: { vramUsedMb: 7000 },
  ...overrides,
});

describe('autenticação', () => {
  it('recusa agente com token inválido e navegador sem token válido', async () => {
    await expect(open('/agent', 'pct_dev_falso')).rejects.toThrow('UNAUTHORIZED');
    await expect(open('/client', 'nao-e-jwt')).rejects.toThrow('UNAUTHORIZED');
    await expect(open('/client', await signRealtimeToken('u', 'outro-segredo'.padEnd(40, 'x')))).rejects.toThrow(
      'UNAUTHORIZED',
    );
  });

  it('agente conectado fica online no banco e começa em HEARTBEAT', async () => {
    const { deviceId, token } = await createDevice('a@example.com');
    const agent = connect(`${url}/agent`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(agent);
    const mode = await nextEvent<{ mode: string; intervalMs: number }>(agent, 'stream:mode');

    expect(mode).toEqual({ mode: 'HEARTBEAT', intervalMs: 60_000 });
    await wait(50);
    expect((await db.device.findUniqueOrThrow({ where: { id: deviceId } })).isOnline).toBe(true);
  });
});

describe('presença e repasse ao vivo', () => {
  it('abrir o painel liga o LIVE, os quadros chegam ao dono e fechar volta ao HEARTBEAT', async () => {
    const { userId, deviceId, token } = await createDevice('dono@example.com');
    const agent = await open('/agent', token);
    const browser = await open('/client', await signRealtimeToken(userId, SECRET));

    const live = nextEvent<{ mode: string }>(agent, 'stream:mode');
    const ack = await browser.emitWithAck('device:subscribe', { deviceId });
    expect(ack).toMatchObject({ ok: true, data: { deviceId, isOnline: true, mode: 'LIVE' } });
    expect((await live).mode).toBe('LIVE');

    const received = nextEvent<{ deviceId: string; frame: LiveFrame }>(browser, 'device:telemetry');
    agent.emit('telemetry:live', frame());
    const relayed = await received;
    expect(relayed.deviceId).toBe(deviceId);
    expect(relayed.frame).toMatchObject({ profile: 'AAA_GAMING', extra: { vramUsedMb: 7000 } }); // campos extras passam
    expect(await db.telemetryHistory.count()).toBe(0); // ao vivo não toca no banco

    const back = nextEvent<{ mode: string }>(agent, 'stream:mode');
    browser.disconnect();
    expect((await back).mode).toBe('HEARTBEAT');
  });

  it('duas abas: só volta ao HEARTBEAT quando a última fecha', async () => {
    const { userId, deviceId, token } = await createDevice('abas@example.com');
    const agent = await open('/agent', token);
    const jwt = await signRealtimeToken(userId, SECRET);
    const tab1 = await open('/client', jwt);
    const tab2 = await open('/client', jwt);
    await tab1.emitWithAck('device:subscribe', { deviceId });
    await tab2.emitWithAck('device:subscribe', { deviceId });
    expect(server.presence.count(deviceId)).toBe(2);

    const modes: string[] = [];
    agent.on('stream:mode', (m: { mode: string }) => modes.push(m.mode));
    await tab1.emitWithAck('device:unsubscribe', { deviceId });
    await wait(50);
    expect(modes).toEqual([]);
    await tab2.emitWithAck('device:unsubscribe', { deviceId });
    await wait(50);
    expect(modes).toEqual(['HEARTBEAT']);
  });

  it('isolamento: outro usuário não entra na sala nem recebe os quadros', async () => {
    const owner = await createDevice('dono2@example.com');
    const intruder = await createDevice('intruso@example.com');
    const agent = await open('/agent', owner.token);
    const spy = await open('/client', await signRealtimeToken(intruder.userId, SECRET));

    expect(await spy.emitWithAck('device:subscribe', { deviceId: owner.deviceId })).toEqual({
      ok: false,
      error: 'Computador não encontrado.',
    });
    let leaked = false;
    spy.on('device:telemetry', () => (leaked = true));
    agent.emit('telemetry:live', frame());
    await wait(100);
    expect(leaked).toBe(false);
    expect(
      await spy.emitWithAck('device:command', { deviceId: owner.deviceId, command: { action: 'ACTION_CLEAN_RAM' } }),
    ).toMatchObject({ ok: false });
  });

  it('descarta quadros malformados', async () => {
    const { userId, deviceId, token } = await createDevice('lixo@example.com');
    const agent = await open('/agent', token);
    const browser = await open('/client', await signRealtimeToken(userId, SECRET));
    await browser.emitWithAck('device:subscribe', { deviceId });
    let count = 0;
    browser.on('device:telemetry', () => count++);

    agent.emit('telemetry:live', { ts: 'ontem', profile: 'HACK' });
    agent.emit('telemetry:live', frame());
    await wait(150);
    expect(count).toBe(1);
  });
});

describe('histórico e alertas', () => {
  it('grava o resumo de 1 minuto e confirma pelo ack', async () => {
    const { deviceId, token } = await createDevice('hb@example.com');
    const agent = await open('/agent', token);
    const hb = {
      ts: Date.now(),
      profile: 'IDLE',
      avgCpuTemp: 45.5,
      avgGpuTemp: 40,
      maxTemp: 52,
      energyConsumedWh: 1.8,
    };

    expect(await agent.emitWithAck('telemetry:heartbeat', hb)).toBe(true);
    expect(await agent.emitWithAck('telemetry:heartbeat', { ts: -1 })).toBe(false);
    const rows = await db.telemetryHistory.findMany({ where: { deviceId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ avgCpuTemp: 45.5, energyConsumedWh: 1.8 });
  });

  it('alerta do agente é gravado, repassado e não se repete dentro do intervalo', async () => {
    const { userId, deviceId, token } = await createDevice('alerta@example.com');
    const agent = await open('/agent', token);
    const browser = await open('/client', await signRealtimeToken(userId, SECRET));
    await browser.emitWithAck('device:subscribe', { deviceId });

    const received = nextEvent<{ type: string }>(browser, 'device:alert');
    const alert = { type: 'OVERHEAT', component: 'gpu', message: 'GPU a 96 °C', value: 96 };
    agent.emit('alert', alert);
    expect((await received).type).toBe('OVERHEAT');
    agent.emit('alert', alert);
    agent.emit('alert', { ...alert, type: 'ABRUPT_CRASH' }); // o agente não pode inventar travamento
    await wait(150);
    expect(await db.alertEvent.count({ where: { deviceId } })).toBe(1);
  });
});

describe('PC removido no site', () => {
  it('a revalidação derruba a conexão do agente', async () => {
    const { deviceId, token } = await createDevice('removido@example.com');
    const agent = await open('/agent', token);
    const dropped = nextEvent<string>(agent, 'disconnect');

    await db.device.delete({ where: { id: deviceId } });
    await server.revalidateAgents();

    expect(await dropped).toBe('io server disconnect');
  });
});

describe('comandos remotos (allowlist)', () => {
  it('repassa ao PC só as ações permitidas e devolve a resposta', async () => {
    const { userId, deviceId, token } = await createDevice('cmd@example.com');
    const agent = await open('/agent', token);
    agent.on('command', (command: { action: string }, ack: (r: unknown) => void) =>
      ack({ ok: true, message: `executado ${command.action}`, data: { freedMb: 2048 } }),
    );
    const browser = await open('/client', await signRealtimeToken(userId, SECRET));

    expect(
      await browser.emitWithAck('device:command', { deviceId, command: { action: 'ACTION_CLEAN_RAM' } }),
    ).toMatchObject({
      ok: false,
      error: 'Abra o painel do computador primeiro.',
    });
    await browser.emitWithAck('device:subscribe', { deviceId });

    expect(await browser.emitWithAck('device:command', { deviceId, command: { action: 'ACTION_CLEAN_RAM' } })).toEqual({
      ok: true,
      data: { ok: true, message: 'executado ACTION_CLEAN_RAM', data: { freedMb: 2048 } },
    });
    expect(
      await browser.emitWithAck('device:command', { deviceId, command: { action: 'RUN_SHELL', cmd: 'format c:' } }),
    ).toEqual({
      ok: false,
      error: 'Comando não permitido.',
    });
    expect(
      await browser.emitWithAck('device:command', {
        deviceId,
        command: { action: 'ACTION_UPDATE_CONFIG', maxCpuTempAlert: 500, maxGpuTempAlert: 80 },
      }),
    ).toMatchObject({ ok: false });
  });

  it('PC offline responde na hora', async () => {
    const { userId, deviceId } = await createDevice('off@example.com');
    const browser = await open('/client', await signRealtimeToken(userId, SECRET));
    await browser.emitWithAck('device:subscribe', { deviceId });
    expect(
      await browser.emitWithAck('device:command', { deviceId, command: { action: 'ACTION_OPTIMIZE_PRIORITY' } }),
    ).toEqual({
      ok: false,
      error: 'O computador está offline.',
    });
  });
});

describe('detecção de travamento', () => {
  async function liveSession(email: string) {
    const d = await createDevice(email);
    const agent = await open('/agent', d.token);
    const browser = await open('/client', await signRealtimeToken(d.userId, SECRET));
    await browser.emitWithAck('device:subscribe', { deviceId: d.deviceId });
    agent.emit('telemetry:live', frame());
    await wait(50);
    return { ...d, agent, browser };
  }

  it('queda brusca sob carga vira ABRUPT_CRASH depois da tolerância', async () => {
    const { deviceId, agent, browser } = await liveSession('crash@example.com');
    const offline = nextEvent<{ isOnline: boolean; status: string }>(browser, 'device:status');
    const crash = nextEvent<{ type: string; details: Record<string, unknown> }>(browser, 'device:alert', 3000);

    agent.io.engine.close(); // corta a conexão sem despedida, como numa tela azul

    expect(await offline).toMatchObject({ isOnline: false, status: 'OFFLINE' });
    const alert = await crash;
    expect(alert.type).toBe('ABRUPT_CRASH');
    expect(alert.details).toMatchObject({ reason: 'queda durante jogo', profile: 'AAA_GAMING', gpuLoadPct: 98 });
    expect(await db.alertEvent.count({ where: { deviceId, type: 'ABRUPT_CRASH' } })).toBe(1);
    expect((await db.device.findUniqueOrThrow({ where: { id: deviceId } })).isOnline).toBe(false);
  });

  it('desligar normalmente ou voltar dentro da tolerância não é travamento', async () => {
    const graceful = await liveSession('normal@example.com');
    graceful.agent.disconnect();
    await wait(500);
    expect(await db.alertEvent.count({ where: { deviceId: graceful.deviceId } })).toBe(0);

    const blip = await liveSession('wifi@example.com');
    blip.agent.io.engine.close();
    await wait(50);
    await open('/agent', blip.token); // Wi-Fi voltou
    await wait(500);
    expect(await db.alertEvent.count({ where: { deviceId: blip.deviceId } })).toBe(0);
  });
});

describe('regras puras', () => {
  it('presença conta espectadores por PC e avisa só nas transições', () => {
    const p = new PresenceTracker();
    expect(p.add('pc', 'a')).toBe('LIVE');
    expect(p.add('pc', 'b')).toBeNull();
    expect(p.remove('pc', 'a')).toBeNull();
    expect(p.removeSocket('b')).toEqual(['pc']);
    expect(p.modeFor('pc')).toBe('HEARTBEAT');
  });

  it('só suspeita de travamento com queda sem despedida e PC sob carga recente', () => {
    const now = 1_000_000;
    const busy = { at: now - 1000, profile: 'IDLE' as const, cpuLoadPct: 80, gpuLoadPct: 10, maxTempC: 70 };
    expect(assessDisconnect('transport close', busy, now).suspected).toBe(true);
    expect(assessDisconnect('ping timeout', { ...busy, cpuLoadPct: 5 }, now).suspected).toBe(false);
    expect(assessDisconnect('client namespace disconnect', busy, now).suspected).toBe(false);
    expect(assessDisconnect('transport close', { ...busy, at: now - 5 * 60_000 }, now).suspected).toBe(false);
    expect(assessDisconnect('transport close', null, now).suspected).toBe(false);
  });
});
