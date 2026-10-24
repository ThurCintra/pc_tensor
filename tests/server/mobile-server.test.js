import { describe, it, expect, afterEach } from 'vitest';
const EventEmitter = require('events');
const { MobileLiveServer, pickLocalIp } = require('../../src/server/mobile-server');
const { ActionRouter } = require('../../src/server/action-router');
const { createFakeExec } = require('../helpers/fake-exec');
const WebSocket = require('ws');

// Servidor de teste isolado: só loopback, sem regras de firewall e sem comandos reais
function createServer(options = {}) {
  const execFile = createFakeExec();
  return new MobileLiveServer({
    host: '127.0.0.1',
    manageFirewall: false,
    actionRouter: new ActionRouter({ execFile }),
    ...options,
  });
}

function openClient(url, options) {
  const client = new WebSocket(url, options);
  return new Promise((resolve, reject) => {
    client.on('open', () => resolve(client));
    client.on('error', reject);
  });
}

describe('MobileLiveServer', () => {
  let serverInstance = null;

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop();
      serverInstance = null;
    }
  });

  it('usa a porta seguinte quando a configurada já está ocupada, sem exceção não tratada', async () => {
    const net = require('net');
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(3893, '127.0.0.1', resolve));
    const uncaught = [];
    const onUncaught = (err) => uncaught.push(err);
    process.on('uncaughtException', onUncaught);

    try {
      serverInstance = createServer({ port: 3893 });
      const info = await serverInstance.start();
      await new Promise((resolve) => setTimeout(resolve, 50)); // dá tempo de um erro tardio aparecer

      expect(info.isRunning).toBe(true);
      expect(info.port).toBe(3894);
      expect(uncaught).toEqual([]);
    } finally {
      process.off('uncaughtException', onUncaught);
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it('deve inicializar o servidor e gerar URL com token efêmero e QR Code', async () => {
    serverInstance = createServer({ port: 3899 });
    const info = await serverInstance.start();

    expect(info.isRunning).toBe(true);
    expect(info.port).toBe(3899);
    expect(info.sessionToken).toBeDefined();
    expect(info.sessionToken.length).toBeGreaterThan(10);
    // URL deve conter o token efêmero no query string para o QR Code
    expect(info.url).toContain(`?token=${info.sessionToken}`);
    expect(info.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('não deve expor o token de sessão em /api/info sem autenticação', async () => {
    serverInstance = createServer({ port: 3893 });
    const info = await serverInstance.start();

    const anon = await (await fetch('http://127.0.0.1:3893/api/info')).json();
    expect(anon.authenticated).toBe(false);
    expect(anon.sessionToken).toBeUndefined();
    expect(anon.qrCodeDataUrl).toBeUndefined();
    expect(JSON.stringify(anon)).not.toContain(info.sessionToken);

    const authed = await (
      await fetch('http://127.0.0.1:3893/api/info', {
        headers: { Authorization: `Bearer ${info.sessionToken}` },
      })
    ).json();
    expect(authed.authenticated).toBe(true);
    expect(authed.sessionToken).toBe(info.sessionToken);
  });

  it('deve bloquear requisições vindas de origens de navegador não autorizadas', async () => {
    serverInstance = createServer({ port: 3892 });
    const info = await serverInstance.start();

    const evil = await fetch(`http://127.0.0.1:3892/api/action?token=${info.sessionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://site-malicioso.example' },
      body: JSON.stringify({ action: 'BOOST_CLEANUP' }),
    });
    expect(evil.status).toBe(403);
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await fetch('http://127.0.0.1:3892/api/info', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    // WebSocket com Origin estranha também é recusado no handshake
    await expect(
      openClient(`ws://127.0.0.1:3892/?token=${info.sessionToken}`, { origin: 'https://site-malicioso.example' }),
    ).rejects.toThrow();
  });

  it('deve exigir token nos endpoints de dados e de controle', async () => {
    serverInstance = createServer({ port: 3891 });
    await serverInstance.start();

    for (const [method, path] of [
      ['GET', '/api/metrics'],
      ['GET', '/api/hardware'],
      ['POST', '/api/server/toggle'],
      ['POST', '/api/action'],
    ]) {
      const res = await fetch(`http://127.0.0.1:3891${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ shouldStart: false }) : undefined,
      });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
    expect(serverInstance.isRunning).toBe(true);
  });

  it('deve rejeitar conexões WebSocket sem token de autenticação quando requireAuth estiver ativo', async () => {
    serverInstance = createServer({ port: 3895, requireAuth: true });
    await serverInstance.start();

    // Tenta conectar sem token
    const client = new WebSocket('ws://127.0.0.1:3895');

    const closed = await new Promise((resolve) => {
      client.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
      client.on('error', () => {});
    });

    expect(closed.code).toBe(4001);
  });

  it('deve aceitar conexão WebSocket com token válido e transmitir dados de telemetria', async () => {
    serverInstance = createServer({ port: 3898, requireAuth: true });
    const info = await serverInstance.start();

    const client = await openClient(`ws://127.0.0.1:3898/?token=${info.sessionToken}`);
    const receivedMessages = [];

    client.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    // Transmite métricas
    const dummyMetrics = {
      temperatures: { cpuMain: 62.5, gpu: 55.0 },
      cpu: { loadPercent: 44.0 },
      memory: { percentUsed: 52.0 },
    };

    serverInstance.broadcastMetrics(dummyMetrics);

    // Aguarda recebimento do pacote
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
    const metricsMsg = receivedMessages.find((m) => m.type === 'metrics_update');
    expect(metricsMsg).toBeDefined();
    expect(metricsMsg.data.temperatures.cpuMain).toBe(62.5);

    client.close();
  });

  it('deve processar comandos remotos bidirecionais (Stream Deck) via WebSocket', async () => {
    serverInstance = createServer({ port: 3894, requireAuth: true });
    const info = await serverInstance.start();

    const client = await openClient(`ws://127.0.0.1:3894/?token=${info.sessionToken}`);

    const received = [];
    client.on('message', (data) => received.push(JSON.parse(data.toString())));

    // 1. Comando de Áudio e Mídia
    client.send(
      JSON.stringify({
        type: 'action',
        action: 'MEDIA_AUDIO_CONTROL',
        command: 'PLAY_PAUSE',
        requestId: 'req_media_1',
      }),
    );

    // 2. Proteção de Processo Crítico (Bloqueio de PID do sistema)
    client.send(
      JSON.stringify({
        type: 'action',
        action: 'KILL_PROCESS',
        pid: 4,
        name: 'System',
        requestId: 'req_kill_1',
      }),
    );

    // 3. Otimização Boost Cleanup
    client.send(
      JSON.stringify({
        type: 'action',
        action: 'BOOST_CLEANUP',
        targets: ['NonExistentAppTest.exe'],
        requestId: 'req_boost_1',
      }),
    );

    // Aguarda respostas do WebSocket
    const startTime = Date.now();
    while (received.filter((m) => m.type === 'action_result').length < 3 && Date.now() - startTime < 6000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Valida resposta da mídia
    const mediaRes = received.find((m) => m.requestId === 'req_media_1');
    expect(mediaRes).toBeDefined();
    expect(mediaRes.type).toBe('action_result');
    expect(mediaRes.success).toBe(true);

    // Valida proteção de processo crítico
    const killRes = received.find((m) => m.requestId === 'req_kill_1');
    expect(killRes).toBeDefined();
    expect(killRes.success).toBe(false);
    expect(killRes.error).toBe('INVALID_PID');

    // Valida boost cleanup: alvo fora da lista configurada é rejeitado
    const boostRes = received.find((m) => m.requestId === 'req_boost_1');
    expect(boostRes).toBeDefined();
    expect(boostRes.success).toBe(true);
    expect(boostRes.freedMB).toBeTypeOf('number');
    expect(boostRes.rejectedTargets).toEqual(['NonExistentAppTest.exe']);

    client.close();
  });

  it('deve fornecer endpoint REST /api/hardware, /api/metrics e /api/action', async () => {
    const mockCollector = {
      getHardwareInfo: async () => ({
        os: { osName: 'Test OS', arch: 'x64' },
        cpu: { name: 'Test CPU', cores: 8 },
        ram: { totalBytes: 16 * 1024 * 1024 * 1024 },
      }),
      getMetricsSnapshot: async () => ({
        temperatures: { cpuMain: 45.0, gpu: 40.0 },
        cpu: { loadPercent: 20.0 },
      }),
    };

    serverInstance = createServer({ port: 3897, collector: mockCollector });
    const info = await serverInstance.start();
    const auth = { Authorization: `Bearer ${info.sessionToken}` };

    // Teste REST /api/hardware
    const hwRes = await fetch('http://127.0.0.1:3897/api/hardware', { headers: auth });
    expect(hwRes.status).toBe(200);
    const hwData = await hwRes.json();
    expect(hwData.os.osName).toBe('Test OS');
    expect(hwData.cpu.name).toBe('Test CPU');

    // Teste REST /api/metrics
    const metricsRes = await fetch('http://127.0.0.1:3897/api/metrics', { headers: auth });
    expect(metricsRes.status).toBe(200);
    const metricsData = await metricsRes.json();
    expect(metricsData.temperatures.cpuMain).toBe(45.0);

    // Teste REST /api/action (sem token deve retornar 401)
    const actionUnauth = await fetch('http://127.0.0.1:3897/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'MEDIA_AUDIO_CONTROL', command: 'VOLUME_UP' }),
    });
    expect(actionUnauth.status).toBe(401);

    // Teste REST /api/action (com token válido)
    const actionAuth = await fetch(`http://127.0.0.1:3897/api/action?token=${info.sessionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'MEDIA_AUDIO_CONTROL', command: 'VOLUME_UP' }),
    });
    expect(actionAuth.status).toBe(200);
    const actionData = await actionAuth.json();
    expect(actionData.success).toBe(true);
  });

  it('deve responder à requisição get_hardware e transmitir session_report via WebSocket', async () => {
    const mockCollector = {
      getHardwareInfo: async () => ({
        cpu: { name: 'Ryzen 9 7950X' },
      }),
      getMetricsSnapshot: async () => ({}),
    };

    serverInstance = createServer({ port: 3896, collector: mockCollector });
    const info = await serverInstance.start();

    const client = await openClient(`ws://127.0.0.1:3896/?token=${info.sessionToken}`);

    const received = [];
    client.on('message', (d) => received.push(JSON.parse(d.toString())));

    client.send(JSON.stringify({ type: 'get_hardware' }));
    await new Promise((resolve) => setTimeout(resolve, 60));

    const hwMsg = received.find((m) => m.type === 'hardware_update');
    expect(hwMsg).toBeDefined();
    expect(hwMsg.data.cpu.name).toBe('Ryzen 9 7950X');

    // Teste de transmissão do relatório pós-sessão de benchmark
    serverInstance.broadcastSessionReport({
      sessionId: 'sess_abc',
      durationSeconds: 120,
      cpu: { peakTemp: 76.5 },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const reportMsg = received.find((m) => m.type === 'session_report');
    expect(reportMsg).toBeDefined();
    expect(reportMsg.data.sessionId).toBe('sess_abc');

    client.close();
  });

  it('não deve duplicar o listener de SESSION_REPORT_READY ao trocar de coletor', () => {
    const first = new EventEmitter();
    const second = new EventEmitter();
    serverInstance = createServer({ collector: first });

    serverInstance.setCollector(first);
    serverInstance.setCollector(second);
    serverInstance.setCollector(second);

    expect(first.listenerCount('SESSION_REPORT_READY')).toBe(0);
    expect(second.listenerCount('SESSION_REPORT_READY')).toBe(1);
  });

  it('deve desconectar os clientes e invalidar o token antigo ao revogar o pareamento', async () => {
    serverInstance = createServer({ port: 3888 });
    const info = await serverInstance.start();
    const oldToken = info.sessionToken;

    const client = await openClient(`ws://127.0.0.1:3888/?token=${oldToken}`);
    const closed = new Promise((resolve) => client.on('close', (code) => resolve(code)));

    const newInfo = await serverInstance.rotateToken('a'.repeat(36));
    expect(await closed).toBe(4001);
    expect(newInfo.sessionToken).toBe('a'.repeat(36));
    expect(newInfo.url).toContain(`token=${'a'.repeat(36)}`);

    const withOld = await fetch('http://127.0.0.1:3888/api/metrics', {
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    expect(withOld.status).toBe(401);
  });

  it('deve reiniciar em outra porta mantendo o token', async () => {
    serverInstance = createServer({ port: 3887 });
    const info = await serverInstance.start();

    const moved = await serverInstance.changePort(3886);
    expect(moved.isRunning).toBe(true);
    expect(moved.port).toBe(3886);
    expect(moved.sessionToken).toBe(info.sessionToken);

    const res = await fetch('http://127.0.0.1:3886/api/info');
    expect(res.status).toBe(200);
    await expect(fetch('http://127.0.0.1:3887/api/info')).rejects.toThrow();
  });

  it('deve servir o build web (mesmo app do desktop) para o celular', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-dist-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>PC Sentinel</title>');

    try {
      serverInstance = createServer({ port: 3885, staticDir: dir });
      await serverInstance.start();
      const res = await fetch('http://127.0.0.1:3885/?token=x');
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('PC Sentinel');
    } finally {
      await serverInstance.stop();
      serverInstance = null;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deve avisar que a interface não foi compilada quando não houver build', async () => {
    serverInstance = createServer({ port: 3884, staticDir: 'C:/caminho/que/nao/existe' });
    await serverInstance.start();
    const res = await fetch('http://127.0.0.1:3884/');
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('npm run build');
  });

  it('deve criar a regra de firewall só quando ela ainda não existir', async () => {
    const existing = createFakeExec();
    const s1 = new MobileLiveServer({ execFile: existing, manageFirewall: true });
    s1.ensureFirewallRule(3890);
    s1.ensureFirewallRule(3890);
    await new Promise((r) => setTimeout(r, 10));
    expect(existing.calls.map((c) => c.args[2])).toEqual(['show']);

    const missing = createFakeExec({
      netsh: (args) => (args[2] === 'show' ? { error: new Error('No rules match') } : {}),
    });
    const s2 = new MobileLiveServer({ execFile: missing, manageFirewall: true });
    s2.ensureFirewallRule(3890);
    await new Promise((r) => setTimeout(r, 10));
    expect(missing.calls.map((c) => c.args[2])).toEqual(['show', 'add']);
    expect(missing.calls[1].args).toContain('localport=3890');
  });
});

describe('pickLocalIp', () => {
  it('deve preferir a interface física da LAN a adaptadores virtuais (WSL/Hyper-V)', () => {
    const ip = pickLocalIp({
      'vEthernet (WSL)': [{ family: 'IPv4', address: '172.29.80.1', internal: false }],
      'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
      Ethernet: [
        { family: 'IPv6', address: 'fe80::1', internal: false },
        { family: 'IPv4', address: '192.168.0.42', internal: false },
      ],
    });
    expect(ip).toBe('192.168.0.42');
  });

  it('deve ignorar link-local e cair para loopback sem interfaces válidas', () => {
    expect(pickLocalIp({ 'Wi-Fi': [{ family: 'IPv4', address: '169.254.10.2', internal: false }] })).toBe('127.0.0.1');
    expect(pickLocalIp({})).toBe('127.0.0.1');
  });
});
