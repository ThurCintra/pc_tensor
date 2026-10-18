import { describe, it, expect, vi } from 'vitest';
const { SystemCollector } = require('../../src/main/collector');

describe('SystemCollector', () => {
  it('deve formatar métricas de CPU e temperaturas corretamente', async () => {
    const mockSi = {
      cpuTemperature: vi.fn().mockResolvedValue({
        main: 55.4,
        cores: [54.0, 56.8],
        max: 56.8,
        socket: [],
        chipset: null,
      }),
      currentLoad: vi.fn().mockResolvedValue({
        currentLoad: 32.5,
        cpus: [{ load: 30.1 }, { load: 34.9 }],
      }),
      mem: vi.fn().mockResolvedValue({
        total: 16 * 1024 * 1024 * 1024,
        used: 8 * 1024 * 1024 * 1024,
        free: 8 * 1024 * 1024 * 1024,
        active: 7.5 * 1024 * 1024 * 1024,
      }),
      graphics: vi.fn().mockResolvedValue({
        controllers: [
          {
            model: 'NVIDIA GeForce RTX 4070',
            temperatureGpu: 48,
            memoryTotal: 12288,
            memoryUsed: 3000,
          },
        ],
      }),
      fsSize: vi.fn().mockResolvedValue([
        {
          fs: 'C:',
          type: 'NTFS',
          size: 1000 * 1024 * 1024 * 1024,
          used: 450 * 1024 * 1024 * 1024,
          use: 45,
          mount: 'C:',
        },
      ]),
    };

    const collector = new SystemCollector(mockSi);
    const metrics = await collector.getMetricsSnapshot();

    expect(metrics).toBeDefined();
    expect(metrics.timestamp).toBeTypeOf('number');

    // Teste de temperaturas
    expect(metrics.temperatures.cpuMain).toBe(55.4);
    expect(metrics.temperatures.cpuMax).toBe(56.8);
    expect(metrics.temperatures.gpu).toBe(48);

    // Teste de CPU
    expect(metrics.cpu.loadPercent).toBe(32.5);

    // Teste de Memória
    expect(metrics.memory.totalGB).toBe(16);
    expect(metrics.memory.usedGB).toBe(8);
    expect(metrics.memory.percentUsed).toBe(50);

    // Teste de Disco
    expect(metrics.disks.length).toBe(1);
    expect(metrics.disks[0].mount).toBe('C:');
    expect(metrics.disks[0].percentUsed).toBe(45);
  });

  it('deve prover fallbacks amigáveis se o hardware não reportar sensores de temperatura direta', async () => {
    const mockSi = {
      cpuTemperature: vi.fn().mockResolvedValue({
        main: null,
        cores: [],
        max: null,
      }),
      currentLoad: vi.fn().mockResolvedValue({ currentLoad: 12.0 }),
      mem: vi.fn().mockResolvedValue({
        total: 16 * 1024 * 1024 * 1024,
        used: 4 * 1024 * 1024 * 1024,
      }),
      graphics: vi.fn().mockResolvedValue({ controllers: [] }),
      fsSize: vi.fn().mockResolvedValue([]),
    };

    const collector = new SystemCollector(mockSi);
    const metrics = await collector.getMetricsSnapshot();

    expect(metrics.temperatures.cpuMain).toBeNull();
    expect(metrics.temperatures.isEstimated).toBe(true);
  });
});
