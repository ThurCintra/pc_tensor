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
});
