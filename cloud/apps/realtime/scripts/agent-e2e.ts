/**
 * Teste de ponta a ponta do agente (Etapa 3) contra a nuvem, tudo neste PC:
 *   serviço C# real  ⇄  servidor de tempo real real  ⇄  "navegador" (socket.io-client)
 * com a API de pareamento usando as mesmas regras do site (apps/web/src/server) e banco em PGlite.
 *
 * Uso (na pasta cloud/, com o serviço compilado em service/…/bin/Debug):
 *   npx tsx apps/realtime/scripts/agent-e2e.ts
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io as connect } from 'socket.io-client';
import { createTestDb } from '@pc-tensor/db/testing';
import { PairRequest } from '@pc-tensor/protocol';
import { signRealtimeToken } from '@pc-tensor/protocol/realtime-token';
import { createRealtimeServer } from '../src/server';
import { createPrismaStore } from '../src/store';
import { createPairingCode, redeemPairingCode } from '../../web/src/server/pairing';
import { authenticateDevice } from '../../web/src/server/devices';
import { ApiError } from '../../web/src/server/errors';

const SECRET = randomUUID() + randomUUID();
const SERVICE_PORT = 3897;
const repo = resolve(import.meta.dirname, '../../../..');
const dotnet = process.env.DOTNET ?? join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'dotnet', 'dotnet.exe');
const serviceDll = join(repo, 'service/PcSentinel.Service/bin/Debug/net10.0-windows/win-x64/pc-sentinel-service.dll');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: [string, boolean, string][] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push([name, ok, detail]);
  console.log(`${ok ? 'OK ' : 'ERRO'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function until(predicate: () => Promise<boolean> | boolean, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await wait(250);
  }
  return false;
}

// Banco, tempo real e a API do agente com as regras do site ------------------------------------
const { db, close } = await createTestDb();
const realtime = createRealtimeServer({
  store: createPrismaStore(db),
  jwtSecret: SECRET,
  corsOrigins: [],
  crashGraceMs: 2000,
  log: { info: () => {}, warn: console.warn, error: console.error },
});
const realtimePort = await realtime.listen(0, '127.0.0.1');

const api = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === 'POST' && req.url === '/api/agent/pair') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      return send(201, await redeemPairingCode(db, PairRequest.parse(JSON.parse(raw))));
    }
    if (req.method === 'GET' && req.url === '/api/agent/me') {
      const device = await authenticateDevice(db, req.headers['x-device-token'] as string | undefined);
      if (!device) return send(401, { error: { code: 'UNAUTHORIZED', message: 'Token inválido.' } });
      return send(200, {
        deviceId: device.id,
        name: device.name,
        maxCpuTempAlert: device.maxCpuTempAlert,
        maxGpuTempAlert: device.maxGpuTempAlert,
        alertsEnabled: device.alertsEnabled,
        realtimeUrl: `http://127.0.0.1:${realtimePort}`,
      });
    }
    send(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  } catch (err) {
    if (err instanceof ApiError) return send(err.status, { error: { code: err.code, message: err.message } });
    send(500, { error: { code: 'INTERNAL', message: String(err) } });
  }
});
await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
const apiUrl = `http://127.0.0.1:${(api.address() as { port: number }).port}`;

// Serviço C# com uma pasta de dados temporária ------------------------------------------------
const dataDir = mkdtempSync(join(tmpdir(), 'pcs-e2e-'));
const localToken = randomUUID();
writeFileSync(join(dataDir, 'settings.json'), JSON.stringify({ sessionToken: localToken }));
const service = spawn(
  dotnet,
  [
    serviceDll,
    '--Port',
    String(SERVICE_PORT),
    '--DataDir',
    dataDir,
    '--ParentPid',
    String(process.pid),
    '--Cloud:HeartbeatInterval',
    '00:00:04',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
const serviceLog: string[] = [];
service.stdout.on('data', (d) => serviceLog.push(String(d)));
service.stderr.on('data', (d) => serviceLog.push(String(d)));

try {
  const up = await until(
    async () => (await fetch(`http://127.0.0.1:${SERVICE_PORT}/health`).catch(() => null))?.ok === true,
    30_000,
  );
  if (!up) throw new Error('o serviço C# não subiu em 30 s');

  // 1. Usuário gera o código no site; o app pede ao serviço para parear --------------------------
  const user = await db.user.create({ data: { name: 'Arthur', email: 'arthur@example.com' } });
  const { code } = await createPairingCode(db, user.id);

  const local = new WebSocket(`ws://127.0.0.1:${SERVICE_PORT}/ws?token=${localToken}`);
  const replies = new Map<string, (data: { ok: boolean; data: unknown; error: string | null }) => void>();
  local.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.type === 'commandResult') replies.get(msg.data.id)?.(msg.data);
  };
  await new Promise((r, reject) => {
    local.onopen = r;
    local.onerror = () => reject(new Error('conexão local com o serviço recusada'));
  });
  const command = (action: string, params: object) =>
    new Promise<{ ok: boolean; data: any; error: string | null }>((resolveReply) => {
      const id = randomUUID();
      replies.set(id, resolveReply);
      local.send(JSON.stringify({ v: 2, type: 'command', id, action, params }));
    });

  const paired = await command('CLOUD_PAIR', { code, apiUrl });
  check('pareamento pelo app com o código de 6 dígitos', paired.ok, paired.error ?? paired.data?.state);
  const device = await db.device.findFirst({ where: { userId: user.id } });
  check(
    'cadastro do PC com o hardware detectado',
    Boolean(device?.cpuModel),
    `${device?.name} · ${device?.cpuModel} · ${device?.gpuModel} · ${device?.totalRamGb} GB`,
  );
  check('código consumido (uso único)', (await db.pairingCode.findFirst({ where: { code } }))?.used === true);

  // 2. Conexão reversa e modo HEARTBEAT -----------------------------------------------------------
  check(
    'agente conectado à nuvem',
    await until(async () => (await db.device.findUniqueOrThrow({ where: { id: device!.id } })).isOnline, 20_000),
  );
  const status = await command('CLOUD_STATUS', {});
  check(
    'estado no app: CONNECTED em HEARTBEAT',
    status.data?.state === 'CONNECTED' && status.data?.mode === 'HEARTBEAT',
    JSON.stringify(status.data),
  );

  // 3. Navegador abre o painel: LIVE a cada 250 ms -----------------------------------------------
  const browser = connect(`http://127.0.0.1:${realtimePort}/client`, {
    auth: { token: await signRealtimeToken(user.id, SECRET) },
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise<void>((r) => browser.once('connect', () => r()));
  const frames: any[] = [];
  browser.on('device:telemetry', (p) => frames.push(p.frame));
  const sub = await browser.emitWithAck('device:subscribe', { deviceId: device!.id });
  check('navegador do dono entra na sala', sub.ok === true);
  await wait(4000);
  const last = frames.at(-1);
  check('quadros ao vivo chegando (~4/s)', frames.length >= 10, `${frames.length} quadros em 4 s`);
  check(
    'quadro com dados reais e perfil da nuvem',
    typeof last?.gpu?.tempC === 'number' && /^(IDLE|WORKSTATION|AAA_GAMING|COMPETITIVE_FPS)$/.test(last?.profile),
    `GPU ${last?.gpu?.tempC} °C · CPU ${last?.cpu?.tempC} °C (${last?.cpu?.tempSource}) · ${last?.profile}`,
  );
  // Os quadros de 250 ms nunca vão para o banco; só o resumo por minuto (aqui a cada 4 s), que segue mesmo
  // com alguém olhando para o histórico não ter buraco
  const rows = await db.telemetryHistory.count();
  check('quadros ao vivo não viram linhas no banco', rows <= 2, `${frames.length} quadros, ${rows} resumos gravados`);

  // 4. Comandos da allowlist ida e volta ---------------------------------------------------------
  const config = await browser.emitWithAck('device:command', {
    deviceId: device!.id,
    command: { action: 'ACTION_UPDATE_CONFIG', maxCpuTempAlert: 88, maxGpuTempAlert: 82 },
  });
  check('ACTION_UPDATE_CONFIG executado no PC', config.ok && config.data.ok, config.data?.message ?? config.error);
  const clean = await browser.emitWithAck('device:command', {
    deviceId: device!.id,
    command: { action: 'ACTION_CLEAN_RAM' },
  });
  check(
    'ACTION_CLEAN_RAM respondeu (sem administrador explica o motivo)',
    clean.ok === true,
    clean.data?.message ?? clean.error,
  );
  const shell = await browser.emitWithAck('device:command', {
    deviceId: device!.id,
    command: { action: 'RUN_SHELL', cmd: 'whoami' },
  });
  check('comando fora da allowlist recusado', shell.ok === false, shell.error);

  // 5. Fecha o painel: volta ao HEARTBEAT e grava o resumo ----------------------------------------
  await browser.emitWithAck('device:unsubscribe', { deviceId: device!.id });
  const saved = await until(async () => (await db.telemetryHistory.count()) > 0, 15_000);
  const hb = await db.telemetryHistory.findFirst();
  check(
    'resumo de 1 minuto gravado (intervalo de 4 s no teste)',
    saved,
    hb ? `CPU média ${hb.avgCpuTemp} · GPU média ${hb.avgGpuTemp} · ${hb.energyConsumedWh.toFixed(3)} Wh` : '',
  );

  // 5b. Queda da conexão: o agente volta sozinho (espera exponencial, começando em ~1 s) -----------
  realtime.io.of('/agent').disconnectSockets(true);
  const droppedAt = Date.now();
  const wentOffline = await until(
    async () => !(await db.device.findUniqueOrThrow({ where: { id: device!.id } })).isOnline,
    5000,
  );
  const cameBack = await until(
    async () => (await db.device.findUniqueOrThrow({ where: { id: device!.id } })).isOnline,
    20_000,
  );
  check(
    'conexão caiu e o agente reconectou sozinho',
    wentOffline && cameBack,
    `voltou em ${((Date.now() - droppedAt) / 1000).toFixed(1)} s`,
  );

  // 6. Usuário remove o PC no site: o agente para e pede novo pareamento -------------------------
  await db.device.delete({ where: { id: device!.id } });
  await realtime.revalidateAgents();
  const revoked = await until(async () => (await command('CLOUD_STATUS', {})).data?.state === 'UNAUTHORIZED', 20_000);
  check('PC removido no site: agente para de tentar (UNAUTHORIZED)', revoked);

  browser.disconnect();
  local.close();
} catch (err) {
  check('execução do teste', false, String(err));
} finally {
  service.kill();
  await realtime.close();
  api.close();
  await close();
}

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
if (failed.length) {
  console.log('\nLog do serviço:\n' + serviceLog.join('').split('\n').slice(-40).join('\n'));
  process.exitCode = 1;
}
