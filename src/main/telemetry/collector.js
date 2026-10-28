const EventEmitter = require('events');

const { NetworkMonitor } = require('./network-monitor');
const { ProcessMonitor } = require('./process-monitor');
const { SessionBenchmark } = require('./session-benchmark');
const { ThermalHistoryStore } = require('./thermal-history');
const { SensorBridge } = require('./sensor-bridge');
const { LhmClient } = require('./lhm-client');
const { NativeMetrics, round1, GB } = require('./native-metrics');
const { collectHardwareInfo } = require('./hardware-info');
const { SensorDriverProbe } = require('./sensor-driver');

const GFX_REFRESH_MS = 60_000;
const DISKS_REFRESH_MS = 30_000;
const THERMAL_SAMPLE_MS = 15_000;
const DEGRADATION_CHECK_MS = 600_000;
const FAN_MAX_RPM = 2400;

const DEFAULT_NETWORK = { latencyMs: 0, jitterMs: 0, packetLossPercent: 0, host: '1.1.1.1', status: 'idle' };
const EMPTY_SWAP = { totalMB: 0, usedMB: 0, percentUsed: 0 };

const num = (value) => (typeof value === 'number' && !isNaN(value) ? value : null);
const positiveNum = (value) => (num(value) !== null && value > 0 ? value : null);

/**
 * SystemCollector
 * Junta as fontes de telemetria em um snapshot por ciclo:
 *   1. ponte de sensores (pc-sensor-bridge.exe, LibreHardwareMonitorLib) – temperaturas reais;
 *   2. servidor web do LibreHardwareMonitor, se estiver aberto;
 *   3. systeminformation (WMI) como reserva da GPU e dos discos, consultado com cache para não pesar;
 *   4. Node (os.cpus/os.totalmem) para carga de CPU e memória.
 * Nunca inventa valores: o que nenhuma fonte informa sai como null. A temperatura da CPU não tem reserva no WMI:
 * no Windows ela vem da zona térmica ACPI (MSAcpi_ThermalZoneTemperature), que em muitas placas é um valor fixo da
 * placa-mãe e não do processador.
 *
 * Opções: si (systeminformation injetável), autoStart (inicia ponte e ping; padrão true) e
 * dependências injetáveis (sensorBridge, lhmClient, nativeMetrics, networkMonitor, processMonitor,
 * sessionBenchmark, thermalHistory, thermalDbPath, sensorDriver).
 */
class SystemCollector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.si = options.si || null;

    this.sensorBridge = options.sensorBridge || new SensorBridge();
    this.lhmClient = options.lhmClient || new LhmClient();
    this.nativeMetrics = options.nativeMetrics || new NativeMetrics();
    this.networkMonitor =
      options.networkMonitor ||
      new NetworkMonitor({
        autoStart: false,
        host: options.networkHost || '1.1.1.1',
        intervalMs: options.networkIntervalMs || 4000,
      });
    this.processMonitor = options.processMonitor || new ProcessMonitor(this.si);
    this.sessionBenchmark = options.sessionBenchmark || new SessionBenchmark(options.benchmark || {});
    this.thermalHistory = options.thermalHistory || new ThermalHistoryStore(options.thermalDbPath);
    this.sensorDriver = options.sensorDriver || new SensorDriverProbe();

    // Caches das consultas lentas ao WMI
    this.cachedGfx = null;
    this.lastGfxCheck = 0;
    this.cachedDisks = [];
    this.lastDisksCheck = 0;
    this.hasWorkingTempSensor = null; // null: ainda não verificado

    this.cachedHardwareInfo = null;
    this.lastThermalSampleRecord = 0;
    this.lastDegradationCheck = 0;
    this.cachedDegradationResult = null;

    this.sessionBenchmark.on('SESSION_REPORT_READY', (report) => {
      try {
        this.thermalHistory?.saveSessionReport(report);
      } catch (err) {
        console.error('[SystemCollector] Erro ao salvar sessão no histórico térmico:', err);
      }
      this.emit('SESSION_REPORT_READY', report);
    });

    if (options.autoStart !== false) {
      this.sensorBridge.start();
      this.networkMonitor.start();
    }
  }

  get cpuModel() {
    return this.nativeMetrics.cpuModel;
  }

  getSi() {
    if (!this.si) this.si = require('systeminformation');
    return this.si;
  }

  stop() {
    this.sensorBridge.stop();
    this.networkMonitor?.stop();
    this.thermalHistory?.close();
  }

  async refreshGraphics(now) {
    if (this.cachedGfx && now - this.lastGfxCheck <= GFX_REFRESH_MS) return;
    try {
      const gpu = (await this.getSi().graphics())?.controllers?.[0];
      this.cachedGfx = gpu
        ? {
            gpuName: gpu.model || gpu.name || 'GPU',
            gpuTemp: num(gpu.temperatureGpu) !== null ? round1(gpu.temperatureGpu) : null,
          }
        : { gpuName: 'GPU', gpuTemp: null };
    } catch {
      this.cachedGfx = this.cachedGfx || { gpuName: 'GPU', gpuTemp: null };
    }
    this.lastGfxCheck = now;
  }

  async refreshDisks(now) {
    if (this.cachedDisks.length > 0 && now - this.lastDisksCheck <= DISKS_REFRESH_MS) return;
    try {
      const fsData = await this.getSi().fsSize();
      this.cachedDisks = (fsData || []).map((disk) => ({
        fs: disk.fs || disk.mount,
        mount: disk.mount || disk.fs,
        type: disk.type,
        sizeGB: round1((disk.size || 0) / GB),
        usedGB: round1((disk.used || 0) / GB),
        percentUsed: round1(disk.use || 0),
      }));
    } catch {
      // mantém a última lista de discos
    }
    this.lastDisksCheck = now;
  }

  async getMetricsSnapshot() {
    const now = Date.now();
    const cpuMetrics = this.nativeMetrics.getCpuLoad();
    const memMetrics = this.nativeMetrics.getMemory();

    const bridge = this.sensorBridge.getFreshData();
    const lhm = await this.lhmClient.poll();

    const bridgeCpuTemp = positiveNum(bridge?.cpu?.temp);
    const bridgeGpuTemp = positiveNum(bridge?.gpu?.temp);
    const realCpuTemp =
      bridgeCpuTemp !== null ? round1(bridgeCpuTemp) : positiveNum(lhm?.cpuTemp) !== null ? round1(lhm.cpuTemp) : null;
    const realGpuTemp =
      bridgeGpuTemp !== null ? round1(bridgeGpuTemp) : positiveNum(lhm?.gpuTemp) !== null ? round1(lhm.gpuTemp) : null;
    const realGpuName = bridge?.gpu?.name && bridge.gpu.name !== 'GPU' ? bridge.gpu.name : null;
    const realFanRpm = positiveNum(lhm?.fanRpm) ?? positiveNum(bridge?.fanRpm) ?? positiveNum(bridge?.gpu?.fanRpm);

    if (realGpuTemp === null) await this.refreshGraphics(now);
    await this.refreshDisks(now);
    this.sensorDriver.refresh(now);

    const cpuTemp = realCpuTemp;
    const gpuTemp = realGpuTemp ?? num(this.cachedGfx?.gpuTemp);
    const isCpuEstimated = cpuTemp === null;
    const isGpuEstimated = gpuTemp === null;
    this.hasWorkingTempSensor = !isCpuEstimated;

    // Sem o driver PawnIO a CPU fica sem temperatura mesmo como administrador: a tela explica a causa
    const sensorDriverMissing = isCpuEstimated && this.sensorDriver.installed === false;
    const fanRpm = realFanRpm !== null ? Math.round(realFanRpm) : null;

    const isAdmin = Boolean(bridge?.isAdmin);
    const cpuName = bridge?.cpu?.name || this.cpuModel;
    const gpuLoad = num(bridge?.gpu?.load);

    const [processes, swap] = await Promise.all([
      this.processMonitor.getTopProcesses().catch(() => []),
      this.processMonitor.getSwapMetrics().catch(() => EMPTY_SWAP),
    ]);

    const bottleneck = ProcessMonitor.detectBottleneck({
      cpuLoad: cpuMetrics.loadPercent,
      gpuLoad,
      ramPercent: memMetrics.percentUsed,
      swapPercent: swap.percentUsed,
      vramPercent: vramPercent(bridge?.gpu),
    });

    const sessionState = this.sessionBenchmark.feedSample({
      timestamp: now,
      cpuTemp,
      gpuTemp,
      cpuLoad: cpuMetrics.loadPercent,
      gpuLoad,
      ramPercent: memMetrics.percentUsed,
      ramUsedGB: memMetrics.usedGB,
      bottleneck,
    });

    this.recordThermalHistory(now, cpuTemp, cpuMetrics.loadPercent);

    return {
      timestamp: now,
      temperatures: {
        cpuMain: cpuTemp,
        cpuMax: cpuTemp,
        cores: cpuTemp !== null ? [cpuTemp] : [],
        gpu: gpuTemp,
        gpuName: realGpuName || this.cachedGfx?.gpuName || 'GPU Primária',
        gpuMemoryTemp: num(bridge?.gpu?.memoryTemp),
        gpuHotspotTemp: num(bridge?.gpu?.hotspotTemp),
        gpuFanRpm: num(bridge?.gpu?.fanRpm),
        gpuPowerWatts: num(bridge?.gpu?.powerWatts),
        gpuVramUsedMB: num(bridge?.gpu?.vramUsedMB),
        gpuVramTotalMB: num(bridge?.gpu?.vramTotalMB),
        cpuName,
        motherboard: {
          name: bridge?.motherboard?.name || 'Placa-mãe',
          temp: num(bridge?.motherboard?.temp) !== null ? round1(bridge.motherboard.temp) : null,
          requiresElevation: bridge?.motherboard ? Boolean(bridge.motherboard.requiresElevation) : true,
        },
        storage: {
          name: bridge?.storage?.name || 'Armazenamento',
          temp: num(bridge?.storage?.temp) !== null ? round1(bridge.storage.temp) : null,
          load: num(bridge?.storage?.load) !== null ? round1(bridge.storage.load) : null,
          requiresElevation: bridge?.storage ? Boolean(bridge.storage.requiresElevation) : true,
        },
        isAdmin,
        requiresElevation: !isAdmin,
        isEstimated: isCpuEstimated || isGpuEstimated,
        isCpuEstimated,
        isGpuEstimated,
        sensorDriverMissing,
      },
      cpu: { ...cpuMetrics, model: cpuName, brand: cpuName },
      memory: memMetrics,
      swap,
      disks: this.cachedDisks,
      network: this.networkMonitor ? this.networkMonitor.getMetrics() : DEFAULT_NETWORK,
      processes,
      bottleneck,
      sessionBenchmark: {
        state: sessionState.state,
        ringStats: sessionState.ringStats,
        lastReport: sessionState.lastReport,
      },
      degradationAlert: this.cachedDegradationResult,
      fan: {
        rpm: fanRpm,
        pwmPercent: fanRpm !== null ? Math.min(100, Math.round((fanRpm / FAN_MAX_RPM) * 100)) : 0,
        maxRpm: FAN_MAX_RPM,
        isReal: fanRpm !== null,
      },
      diskIo: {
        readMBps: bridge?.diskIo ? round1((Number(bridge.diskIo.readBytesSec) || 0) / (1024 * 1024)) : 0,
        writeMBps: bridge?.diskIo ? round1((Number(bridge.diskIo.writeBytesSec) || 0) / (1024 * 1024)) : 0,
        isReal: Boolean(bridge?.diskIo),
      },
    };
  }

  /** Agregados diários (a cada 15 s) e verificação de degradação térmica (a cada 10 min). */
  recordThermalHistory(now, cpuTemp, cpuLoad) {
    if (now - this.lastThermalSampleRecord > THERMAL_SAMPLE_MS) {
      this.lastThermalSampleRecord = now;
      if (cpuTemp !== null && cpuTemp > 0) {
        this.thermalHistory.recordDailyAggregate(cpuTemp, cpuLoad < 35);
      }
    }
    if (!this.cachedDegradationResult || now - this.lastDegradationCheck > DEGRADATION_CHECK_MS) {
      this.lastDegradationCheck = now;
      this.cachedDegradationResult = this.thermalHistory.checkThermalDegradation();
    }
  }

  async getHardwareInfo(forceRefresh = false) {
    if (this.cachedHardwareInfo && !forceRefresh) return this.cachedHardwareInfo;
    this.cachedHardwareInfo = await collectHardwareInfo(this.getSi(), {
      cachedGfx: this.cachedGfx,
      cachedDisks: this.cachedDisks,
      hasWorkingTempSensor: this.hasWorkingTempSensor,
      bridgeData: this.sensorBridge.latest,
    });
    return this.cachedHardwareInfo;
  }
}

function vramPercent(gpu) {
  const used = gpu?.vramUsedMB ?? gpu?.vramUsed;
  const total = gpu?.vramTotalMB ?? gpu?.vramTotal;
  return used && total ? round1((used / total) * 100) : null;
}

module.exports = { SystemCollector };
