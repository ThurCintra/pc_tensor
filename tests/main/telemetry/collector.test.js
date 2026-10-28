import { describe, it, expect, vi, afterEach } from 'vitest';
const { SystemCollector } = require('../../../src/main/telemetry/collector');
const { parseLhmTree } = require('../../../src/main/telemetry/lhm-client');

const GB = 1024 * 1024 * 1024;

/**
 * Coletor com todas as fontes simuladas: nada consulta o hardware real, abre processos ou grava
 * arquivos (o histórico térmico fica em memória).
 */
function createCollector({ si = {}, bridgeData = null, lhmData = null, ...overrides } = {}) {
  return new SystemCollector({
    autoStart: false,
    si: {
      graphics: vi.fn().mockResolvedValue({ controllers: [] }),
      fsSize: vi.fn().mockResolvedValue([]),
      cpuTemperature: vi.fn().mockResolvedValue({ main: null, cores: [], max: null }),
      ...si,
    },
    sensorBridge: { start: vi.fn(), stop: vi.fn(), getFreshData: () => bridgeData, latest: bridgeData },
    lhmClient: { poll: vi.fn().mockResolvedValue(lhmData) },
    nativeMetrics: {
      cpuModel: 'CPU de teste',
      getCpuLoad: () => ({ loadPercent: 32.5, cores: [30.1, 34.9] }),
      getMemory: () => ({ totalGB: 16, usedGB: 8, percentUsed: 50 }),
    },
    processMonitor: {
      getTopProcesses: vi.fn().mockResolvedValue([{ pid: 101, name: 'game.exe', cpuPercent: 65 }]),
      getSwapMetrics: vi.fn().mockResolvedValue({ totalMB: 8192, usedMB: 2048, percentUsed: 25 }),
    },
    thermalDbPath: ':memory:',
    sensorDriver: { refresh: vi.fn(), installed: null },
    ...overrides,
  });
}

describe('SystemCollector', () => {
  let collector;
  afterEach(() => collector?.stop());

  it('usa o WMI como reserva da GPU e dos discos, mas nunca para a temperatura da CPU', async () => {
    const cpuTemperature = vi.fn().mockResolvedValue({ main: 27.8, cores: [], max: 27.8 });
    collector = createCollector({
      si: {
        cpuTemperature,
        graphics: vi
          .fn()
          .mockResolvedValue({ controllers: [{ model: 'NVIDIA GeForce RTX 4070', temperatureGpu: 48 }] }),
        fsSize: vi
          .fn()
          .mockResolvedValue([{ fs: 'C:', mount: 'C:', type: 'NTFS', size: 1000 * GB, used: 450 * GB, use: 45 }]),
      },
    });

    const metrics = await collector.getMetricsSnapshot();

    expect(metrics.timestamp).toBeTypeOf('number');
    // A zona térmica ACPI do WMI costuma ser um valor fixo da placa-mãe: a CPU fica sem sensor
    expect(cpuTemperature).not.toHaveBeenCalled();
    expect(metrics.temperatures.cpuMain).toBeNull();
    expect(metrics.temperatures.cpuMax).toBeNull();
    expect(metrics.temperatures.cores).toEqual([]);
    expect(metrics.temperatures.isCpuEstimated).toBe(true);
    expect(metrics.temperatures.gpu).toBe(48);
    expect(metrics.temperatures.gpuName).toBe('NVIDIA GeForce RTX 4070');
    expect(metrics.temperatures.isGpuEstimated).toBe(false);
    expect(metrics.cpu.loadPercent).toBe(32.5);
    expect(metrics.cpu.model).toBe('CPU de teste');
    expect(metrics.memory).toEqual({ totalGB: 16, usedGB: 8, percentUsed: 50 });
    expect(metrics.disks).toEqual([
      { fs: 'C:', mount: 'C:', type: 'NTFS', sizeGB: 1000, usedGB: 450, percentUsed: 45 },
    ]);
  });

  it('informa null (e não um valor inventado) quando nenhuma fonte tem temperatura', async () => {
    collector = createCollector();

    const metrics = await collector.getMetricsSnapshot();

    expect(metrics.temperatures.cpuMain).toBeNull();
    expect(metrics.temperatures.gpu).toBeNull();
    expect(metrics.temperatures.cores).toEqual([]);
    expect(metrics.temperatures.isEstimated).toBe(true);
    expect(metrics.fan).toMatchObject({ rpm: null, isReal: false });
    expect(metrics.diskIo).toEqual({ readMBps: 0, writeMBps: 0, isReal: false });
  });

  it('avisa que falta o driver PawnIO quando a CPU está sem temperatura e o driver não está instalado', async () => {
    const sensorDriver = { refresh: vi.fn(), installed: false };
    collector = createCollector({ sensorDriver });

    const metrics = await collector.getMetricsSnapshot();

    expect(sensorDriver.refresh).toHaveBeenCalled();
    expect(metrics.temperatures.cpuMain).toBeNull();
    expect(metrics.temperatures.sensorDriverMissing).toBe(true);
  });

  it('não acusa falta do driver quando ele está instalado, não foi verificado ou a CPU já tem temperatura', async () => {
    collector = createCollector({ sensorDriver: { refresh: vi.fn(), installed: true } });
    expect((await collector.getMetricsSnapshot()).temperatures.sensorDriverMissing).toBe(false);
    collector.stop();

    collector = createCollector({ sensorDriver: { refresh: vi.fn(), installed: null } });
    expect((await collector.getMetricsSnapshot()).temperatures.sensorDriverMissing).toBe(false);
    collector.stop();

    collector = createCollector({
      sensorDriver: { refresh: vi.fn(), installed: false },
      bridgeData: { success: true, isAdmin: true, cpu: { name: 'Intel Core i3-10110U', temp: 52 } },
    });
    expect((await collector.getMetricsSnapshot()).temperatures.sensorDriverMissing).toBe(false);
  });

  it('prioriza a ponte de sensores e não consulta o WMI para o que ela já informou', async () => {
    const si = {
      cpuTemperature: vi.fn().mockResolvedValue({ main: 99 }),
      graphics: vi.fn().mockResolvedValue({ controllers: [] }),
    };
    collector = createCollector({
      si,
      bridgeData: {
        success: true,
        isAdmin: false,
        cpu: { name: 'AMD Ryzen 5 9600X', temp: 51.5, load: 35.0 },
        gpu: {
          name: 'AMD Radeon RX 7600',
          temp: 68.0,
          hotspotTemp: 78.0,
          memoryTemp: 80.0,
          fanRpm: 830,
          load: 95.0,
          powerWatts: 85.0,
          vramUsedMB: 6140,
          vramTotalMB: 8176,
        },
        motherboard: { name: 'MSI PRO B650M-P (MS-7E27)', temp: null, requiresElevation: true },
        storage: { name: 'KINGSTON SNV3S500G', temp: null, load: null, requiresElevation: true },
        diskIo: { readBytesSec: 5242880, writeBytesSec: 1048576 },
        fanRpm: 830,
      },
    });

    const metrics = await collector.getMetricsSnapshot();

    expect(si.cpuTemperature).not.toHaveBeenCalled();
    expect(si.graphics).not.toHaveBeenCalled();
    expect(metrics.temperatures.cpuMain).toBe(51.5);
    expect(metrics.temperatures.cpuName).toBe('AMD Ryzen 5 9600X');
    expect(metrics.temperatures.gpu).toBe(68.0);
    expect(metrics.temperatures.gpuHotspotTemp).toBe(78.0);
    expect(metrics.temperatures.gpuMemoryTemp).toBe(80.0);
    expect(metrics.temperatures.gpuName).toBe('AMD Radeon RX 7600');
    expect(metrics.temperatures.isAdmin).toBe(false);
    expect(metrics.temperatures.requiresElevation).toBe(true);
    expect(metrics.temperatures.motherboard.name).toBe('MSI PRO B650M-P (MS-7E27)');
    expect(metrics.temperatures.storage.name).toBe('KINGSTON SNV3S500G');
    expect(metrics.diskIo).toEqual({ readMBps: 5.0, writeMBps: 1.0, isReal: true });
    expect(metrics.fan).toMatchObject({ rpm: 830, isReal: true });
  });

  it('usa o servidor web do LibreHardwareMonitor quando a ponte não está ativa', async () => {
    collector = createCollector({ lhmData: { cpuTemp: 61.26, gpuTemp: 57.0, fanRpm: 1250 } });

    const metrics = await collector.getMetricsSnapshot();

    expect(metrics.temperatures.cpuMain).toBe(61.3);
    expect(metrics.temperatures.gpu).toBe(57);
    expect(metrics.fan.rpm).toBe(1250);
  });

  it('inclui rede, processos, swap, gargalo e benchmark de sessão no snapshot', async () => {
    collector = createCollector();

    const metrics = await collector.getMetricsSnapshot();

    expect(metrics.network.target).toBe('1.1.1.1');
    expect(['MEASURING', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DISCONNECTED']).toContain(metrics.network.status);
    expect(metrics.processes).toEqual([{ pid: 101, name: 'game.exe', cpuPercent: 65 }]);
    expect(metrics.swap).toEqual({ totalMB: 8192, usedMB: 2048, percentUsed: 25 });
    expect(['BALANCED', 'CPU_BOUND', 'GPU_BOUND', 'VRAM_PRESSURE', 'RAM_SWAP_RISK']).toContain(
      metrics.bottleneck.state,
    );
    expect(['IDLE', 'HIGH_LOAD', 'COOLDOWN']).toContain(metrics.sessionBenchmark.state);
    expect(metrics.sessionBenchmark.ringStats).toBeDefined();
    expect(metrics.degradationAlert).toBeDefined();
  });

  it('repassa o evento SESSION_REPORT_READY da máquina de benchmark', () => {
    collector = createCollector();
    const listener = vi.fn();
    collector.on('SESSION_REPORT_READY', listener);

    const report = { sessionId: 'test_session_123', timestamp: Date.now(), durationSeconds: 180 };
    collector.sessionBenchmark.emit('SESSION_REPORT_READY', report);

    expect(listener).toHaveBeenCalledWith(report);
  });

  it('só inicia a ponte de sensores e o ping quando autoStart não é desligado', () => {
    const sensorBridge = { start: vi.fn(), stop: vi.fn(), getFreshData: () => null };
    const networkMonitor = { start: vi.fn(), stop: vi.fn(), getMetrics: vi.fn() };

    collector = createCollector({ sensorBridge, networkMonitor });
    expect(sensorBridge.start).not.toHaveBeenCalled();
    collector.stop();

    collector = createCollector({ sensorBridge, networkMonitor, autoStart: true });
    expect(sensorBridge.start).toHaveBeenCalledTimes(1);
    expect(networkMonitor.start).toHaveBeenCalledTimes(1);
  });
});

describe('parseLhmTree', () => {
  it('extrai temperaturas de CPU/GPU e RPM da árvore do LibreHardwareMonitor', () => {
    const tree = {
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
            { text: 'Temperatures', children: [{ text: 'GPU Core', Value: '58,0 °C' }] },
            { text: 'Fans', children: [{ text: 'GPU Fan', Value: '1250 RPM' }] },
          ],
        },
      ],
    };

    expect(parseLhmTree(tree)).toEqual({ cpuTemp: 52.4, gpuTemp: 58.0, fanRpm: 1250 });
  });

  it('devolve null para uma resposta sem sensores', () => {
    expect(parseLhmTree(null)).toBeNull();
    expect(parseLhmTree({ text: 'vazio' })).toBeNull();
  });
});
