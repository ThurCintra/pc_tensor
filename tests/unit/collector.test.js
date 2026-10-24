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

  it('deve parsear árvore de dados do LibreHardwareMonitor corretamente', () => {
    const collector = new SystemCollector({});
    const mockTree = {
      text: 'PC-ROOT',
      children: [
        {
          text: 'AMD Ryzen 5 9600X',
          children: [
            {
              text: 'Temperatures',
              children: [
                { text: 'Core (Tctl/Tdie)', Value: '52,4 °C' },
                { text: 'CPU Package', Value: '51,8 °C' },
              ],
            },
          ],
        },
        {
          text: 'AMD Radeon RX 7600',
          children: [
            {
              text: 'Temperatures',
              children: [
                { text: 'GPU Core', Value: '58,0 °C' },
              ],
            },
            {
              text: 'Fans',
              children: [
                { text: 'GPU Fan', Value: '1250 RPM' },
              ],
            },
          ],
        },
      ],
    };

    const parsed = collector._parseLhmTree(mockTree);
    expect(parsed).toBeDefined();
    expect(parsed.cpuTemp).toBe(52.4);
    expect(parsed.gpuTemp).toBe(58.0);
    expect(parsed.fanRpm).toBe(1250);
  });

  it('deve enriquecer o snapshot com métricas da FASE 1 (Rede, Swap, Gargalos e Benchmark)', async () => {
    const mockSi = {
      cpuTemperature: vi.fn().mockResolvedValue({ main: 60.0, cores: [60.0], max: 60.0 }),
      currentLoad: vi.fn().mockResolvedValue({ currentLoad: 50.0, cpus: [{ load: 50.0 }] }),
      mem: vi.fn().mockResolvedValue({
        total: 16 * 1024 * 1024 * 1024,
        used: 12 * 1024 * 1024 * 1024,
        free: 4 * 1024 * 1024 * 1024,
        swaptotal: 8 * 1024 * 1024 * 1024,
        swapused: 2 * 1024 * 1024 * 1024,
      }),
      processes: vi.fn().mockResolvedValue({
        list: [
          { pid: 101, name: 'game.exe', cpu: 65, memRss: 2048 * 1024 },
          { pid: 102, name: 'discord.exe', cpu: 5, memRss: 300 * 1024 },
        ],
      }),
      graphics: vi.fn().mockResolvedValue({ controllers: [] }),
      fsSize: vi.fn().mockResolvedValue([]),
    };

    const collector = new SystemCollector(mockSi);
    const metrics = await collector.getMetricsSnapshot();

    // Rede
    expect(metrics.network).toBeDefined();
    expect(metrics.network.packetLossPercent).toBeTypeOf('number');
    expect(['MEASURING', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DISCONNECTED']).toContain(metrics.network.status);
    expect(metrics.network.target).toBe('1.1.1.1');

    // Processos
    expect(metrics.processes).toBeDefined();
    expect(Array.isArray(metrics.processes)).toBe(true);

    // Swap
    expect(metrics.swap).toBeDefined();
    expect(metrics.swap.totalMB).toBeTypeOf('number');
    expect(metrics.swap.usedMB).toBeTypeOf('number');
    expect(metrics.swap.percentUsed).toBeTypeOf('number');

    // Gargalo Dinâmico
    expect(metrics.bottleneck).toBeDefined();
    expect(['BALANCED', 'CPU_BOUND', 'GPU_BOUND', 'VRAM_PRESSURE', 'RAM_SWAP_RISK']).toContain(metrics.bottleneck.state);

    // Ring Buffer e Session Benchmark
    expect(metrics.sessionBenchmark).toBeDefined();
    expect(['IDLE', 'HIGH_LOAD', 'COOLDOWN']).toContain(metrics.sessionBenchmark.state);
    expect(metrics.sessionBenchmark.ringStats).toBeDefined();

    // Alerta de Degradação Térmica
    expect(metrics.degradationAlert).toBeDefined();

    collector.stop();
  });

  it('deve repassar o evento SESSION_REPORT_READY emitido pela máquina de benchmark', async () => {
    const collector = new SystemCollector({});
    let capturedReport = null;

    collector.on('SESSION_REPORT_READY', (report) => {
      capturedReport = report;
    });

    const testReport = {
      sessionId: 'test_session_123',
      timestamp: Date.now(),
      durationSeconds: 180,
      cpu: { peakTemp: 78.5, avgTemp: 71.2 },
      gpu: { peakTemp: 72.0, avgTemp: 68.4 },
      ram: { peakUsedGB: 11.5, avgUsedGB: 10.2 },
      throttlingEventsCount: 0,
      bottleneckDominant: 'BALANCED',
    };

    // Emite diretamente do sessionBenchmark interno
    collector.sessionBenchmark.emit('SESSION_REPORT_READY', testReport);

    expect(capturedReport).toBeDefined();
    expect(capturedReport.sessionId).toBe('test_session_123');

    collector.stop();
  });

  it('deve processar e integrar telemetria física real do sensor bridge (Motherboard, Storage, Admin e DiskIo)', async () => {
    const collector = new SystemCollector(null);
    // Caminho real do snapshot, mas sem consultar o hardware (lento no runner do CI)
    collector.si = {
      graphics: vi.fn().mockResolvedValue({ controllers: [] }),
      fsSize: vi.fn().mockResolvedValue([]),
      cpuTemperature: vi.fn().mockResolvedValue({ main: null, cores: [], max: null }),
    };
    collector.latestBridgeData = {
      success: true,
      isAdmin: false,
      cpu: { name: 'AMD Ryzen 5 9600X', temp: 51.5, load: 35.0 },
      gpu: { name: 'AMD Radeon RX 7600', temp: 68.0, hotspotTemp: 78.0, memoryTemp: 80.0, fanRpm: 830, load: 95.0, powerWatts: 85.0, vramUsedMB: 6140, vramTotalMB: 8176 },
      motherboard: { name: 'MSI PRO B650M-P (MS-7E27)', temp: null, requiresElevation: true },
      storage: { name: 'KINGSTON SNV3S500G', temp: null, load: null, requiresElevation: true },
      diskIo: { readBytesSec: 5242880, writeBytesSec: 1048576 },
      fanRpm: 830,
      realSensors: { cpu: true, gpu: true, motherboard: false, storage: false },
    };
    collector.lastBridgeUpdate = Date.now();

    const metrics = await collector.getMetricsSnapshot();

    expect(metrics).toBeDefined();
    expect(metrics.temperatures.cpuMain).toBe(51.5);
    expect(metrics.temperatures.gpu).toBe(68.0);
    expect(metrics.temperatures.gpuHotspotTemp).toBe(78.0);
    expect(metrics.temperatures.gpuMemoryTemp).toBe(80.0);
    expect(metrics.temperatures.isAdmin).toBe(false);
    expect(metrics.temperatures.requiresElevation).toBe(true);
    expect(metrics.temperatures.motherboard.name).toBe('MSI PRO B650M-P (MS-7E27)');
    expect(metrics.temperatures.storage.name).toBe('KINGSTON SNV3S500G');
    expect(metrics.diskIo.readMBps).toBe(5.0);
    expect(metrics.diskIo.writeMBps).toBe(1.0);
    expect(metrics.diskIo.isReal).toBe(true);
    expect(metrics.fan.rpm).toBe(830);

    collector.stop();
  });
});
