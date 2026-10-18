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

  it('deve inicializar o servidor e gerar URL e QR Code', async () => {
    serverInstance = new MobileLiveServer({ port: 3899 });
    const info = await serverInstance.start();

    expect(info.isRunning).toBe(true);
    expect(info.port).toBe(3899);
    expect(info.url).toContain('3899');
    expect(info.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('deve aceitar conexão WebSocket e transmitir dados de telemetria', async () => {
    serverInstance = new MobileLiveServer({ port: 3898 });
    await serverInstance.start();

    const client = new WebSocket('ws://127.0.0.1:3898');
    const receivedMessages = [];

    await new Promise((resolve) => {
      client.on('open', () => {
        resolve();
      });
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
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
    const metricsMsg = receivedMessages.find((m) => m.type === 'metrics_update');
    expect(metricsMsg).toBeDefined();
    expect(metricsMsg.data.temperatures.cpuMain).toBe(62.5);

    client.close();
  });

  it('deve fornecer endpoint REST /api/hardware e /api/metrics', async () => {
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
    await serverInstance.start();

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

    // Teste REST /api/server/toggle
    const toggleRes = await fetch('http://127.0.0.1:3897/api/server/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shouldStart: true }),
    });
    expect(toggleRes.status).toBe(200);
  });

  it('deve responder à requisição get_hardware via WebSocket', async () => {
    const mockCollector = {
      getHardwareInfo: async () => ({
        cpu: { name: 'Ryzen 9 7950X' },
      }),
      getMetricsSnapshot: async () => ({}),
    };

    serverInstance = new MobileLiveServer({ port: 3896, collector: mockCollector });
    await serverInstance.start();

    const client = new WebSocket('ws://127.0.0.1:3896');
    await new Promise((resolve) => client.on('open', resolve));

    const received = [];
    client.on('message', (d) => received.push(JSON.parse(d.toString())));

    client.send(JSON.stringify({ type: 'get_hardware' }));
    await new Promise((resolve) => setTimeout(resolve, 60));

    const hwMsg = received.find((m) => m.type === 'hardware_update');
    expect(hwMsg).toBeDefined();
    expect(hwMsg.data.cpu.name).toBe('Ryzen 9 7950X');

    client.close();
  });
});
