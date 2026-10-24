import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const { NetworkMonitor } = require('../../../src/main/telemetry/network-monitor');

describe('NetworkMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new NetworkMonitor({ intervalMs: 1000, timeoutMs: 500 });
  });

  afterEach(() => {
    monitor.stop();
  });

  it('deve inicializar com métricas padrão', () => {
    const metrics = monitor.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.status).toBe('MEASURING');
    expect(metrics.packetLossPercent).toBe(0);
    expect(metrics.target).toBe('1.1.1.1');
  });

  it('deve calcular latência, jitter e status EXCELLENT em medições estáveis', () => {
    monitor.recordProbe({ success: true, latency: 15 });
    monitor.recordProbe({ success: true, latency: 17 });
    monitor.recordProbe({ success: true, latency: 16 });

    const metrics = monitor.getMetrics();
    expect(metrics.latencyMs).toBe(16);
    expect(metrics.jitterMs).toBe(1.5); // (|17-15| + |16-17|) / 2 = (2 + 1) / 2 = 1.5
    expect(metrics.packetLossPercent).toBe(0);
    expect(metrics.status).toBe('EXCELLENT');
  });

  it('deve calcular packet loss e degradar status para POOR ou DISCONNECTED', () => {
    monitor.recordProbe({ success: false, latency: null });
    monitor.recordProbe({ success: false, latency: null });
    monitor.recordProbe({ success: false, latency: null });

    const metrics = monitor.getMetrics();
    expect(metrics.packetLossPercent).toBe(100);
    expect(metrics.status).toBe('DISCONNECTED');
  });

  it('deve identificar status FAIR ou POOR quando latência for elevada', () => {
    monitor.recordProbe({ success: true, latency: 120 });
    monitor.recordProbe({ success: true, latency: 125 });

    const metrics = monitor.getMetrics();
    expect(metrics.latencyMs).toBe(122.5);
    expect(metrics.status).toBe('FAIR');
  });

  it('deve iniciar e parar o timer sem erros', () => {
    monitor.start();
    expect(monitor.timer).not.toBeNull();
    monitor.stop();
    expect(monitor.timer).toBeNull();
  });
});
