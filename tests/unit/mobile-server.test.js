import { describe, it, expect, afterEach } from 'vitest';
const { MobileLiveServer } = require('../../src/server/mobile-server');
const WebSocket = require('ws');

describe('MobileLiveServer', () => {
  let serverInstance = null;

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop();
      serverInstance = null;
    }
  });

  it('deve inicializar o servidor e gerar URL com token efêmero e QR Code', async () => {
    serverInstance = new MobileLiveServer({ port: 3899 });
    const info = await serverInstance.start();

    expect(info.isRunning).toBe(true);
    expect(info.port).toBe(3899);
    expect(info.sessionToken).toBeDefined();
    expect(info.sessionToken.length).toBeGreaterThan(10);
    // URL deve conter o token efêmero no query string para o QR Code
    expect(info.url).toContain(`?token=${info.sessionToken}`);
    expect(info.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('deve rejeitar conexões WebSocket sem token de autenticação quando requireAuth estiver ativo', async () => {
    serverInstance = new MobileLiveServer({ port: 3895, requireAuth: true });
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
    serverInstance = new MobileLiveServer({ port: 3898, requireAuth: true });
    const info = await serverInstance.start();

    const client = new WebSocket(`ws://127.0.0.1:3898/?token=${info.sessionToken}`);
    const receivedMessages = [];

    await new Promise((resolve) => {
      client.on('open', resolve);
    });

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
    serverInstance = new MobileLiveServer({ port: 3894, requireAuth: true });
    const info = await serverInstance.start();

    const client = new WebSocket(`ws://127.0.0.1:3894/?token=${info.sessionToken}`);
    await new Promise((resolve) => client.on('open', resolve));

    const received = [];
    client.on('message', (data) => received.push(JSON.parse(data.toString())));

    // 1. Comando de Áudio e Mídia
    client.send(JSON.stringify({
      type: 'action',
      action: 'MEDIA_AUDIO_CONTROL',
      command: 'PLAY_PAUSE',
      requestId: 'req_media_1',
    }));

    // 2. Proteção de Processo Crítico (Bloqueio de PID do sistema)
    client.send(JSON.stringify({
      type: 'action',
      action: 'KILL_PROCESS',
      pid: 4,
      name: 'System',
      requestId: 'req_kill_1',
    }));

    // 3. Otimização Boost Cleanup
    client.send(JSON.stringify({
      type: 'action',
      action: 'BOOST_CLEANUP',
      targets: ['NonExistentAppTest.exe'],
      requestId: 'req_boost_1',
    }));

    // Aguarda respostas do WebSocket
    const startTime = Date.now();
    while (received.length < 3 && Date.now() - startTime < 6000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
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

    // Valida boost cleanup
    const boostRes = received.find((m) => m.requestId === 'req_boost_1');
    expect(boostRes).toBeDefined();
    expect(boostRes.success).toBe(true);
    expect(boostRes.freedMB).toBeTypeOf('number');

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

    serverInstance = new MobileLiveServer({ port: 3897, collector: mockCollector });
    const info = await serverInstance.start();

    // Teste REST /api/hardware
    const hwRes = await fetch('http://127.0.0.1:3897/api/hardware');
    expect(hwRes.status).toBe(200);
    const hwData = await hwRes.json();
    expect(hwData.os.osName).toBe('Test OS');
    expect(hwData.cpu.name).toBe('Test CPU');

    // Teste REST /api/metrics
    const metricsRes = await fetch('http://127.0.0.1:3897/api/metrics');
    expect(metricsRes.status).toBe(200);
    const metricsData = await metricsRes.json();
    expect(metricsData.temperatures.cpuMain).toBe(45.0);

    // Teste REST /api/action (sem token deve retornar 401)
    const actionUnauth = await fetch('http://127.0.0.1:3897/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'MEDIA_AUDIO_CONTROL', command: 'MUTE_MIC' }),
    });
    expect(actionUnauth.status).toBe(401);

    // Teste REST /api/action (com token válido)
    const actionAuth = await fetch(`http://127.0.0.1:3897/api/action?token=${info.sessionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'MEDIA_AUDIO_CONTROL', command: 'MUTE_MIC' }),
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

    serverInstance = new MobileLiveServer({ port: 3896, collector: mockCollector });
    const info = await serverInstance.start();

    const client = new WebSocket(`ws://127.0.0.1:3896/?token=${info.sessionToken}`);
    await new Promise((resolve) => client.on('open', resolve));

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
});
