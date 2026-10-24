const os = require('os');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const EventEmitter = require('events');

const { NetworkMonitor } = require('./network-monitor');
const { ProcessMonitor, detectBottleneck } = require('./process-monitor');
const { SessionBenchmark, RingBuffer } = require('./session-benchmark');
const { ThermalHistoryStore } = require('./thermal-history');

/**
 * SystemCollector
 * Responsável por coletar e normalizar métricas de hardware, sensores e temperaturas.
 * Otimizado para alto desempenho com zero impacto de CPU, integrando bridge C# nativo
 * do LibreHardwareMonitor com suporte direto a AMD Ryzen (Zen 5) e AMD Radeon (RDNA3).
 */
class SystemCollector extends EventEmitter {
  constructor(systemInfoModule = null, options = {}) {
    super();
    this.si = systemInfoModule;
    this.isCustomModule = !!systemInfoModule;
    this.options = options || {};

    // Cache inteligente de dados estáticos/lentos para evitar chamadas de processo CLI
    this.cachedGfx = null;
    this.lastGfxCheck = 0;
    this.cachedDisks = [];
    this.lastDisksCheck = 0;
    this.cachedTemp = { main: null, cores: [], max: null };
    this.lastTempCheck = 0;
    this.hasWorkingTempSensor = null; // null: a verificar, true: disponível, false: indisponível

    // Inércia térmica para modelo contínuo (quando não há sensor ACPI/WMI direto no SO)
    this.currentCpuTemp = 41.5;
    this.currentGpuTemp = 44.0;

    // Identificação do Modelo de Processador Host via libuv (zero processos)
    this.cpuModel = this.getCpuModel();

    // Cache para especificações estáticas completas de hardware (hardware:info)
    this.cachedHardwareInfo = null;

    // Snapshot inicial para cálculo nativo diferencial de CPU (zero processos)
    this.prevCpuSnap = this.getCpuTimes();

    // Bridge nativo LibreHardwareMonitor (C# streaming com suporte AMD Zen/RDNA3)
    this.bridgeProcess = null;
    this.latestBridgeData = null;
    this.lastBridgeUpdate = 0;
    this.latestLhmData = null;
    this.lastLhmCheck = 0;
    this.isBridgeActive = false;
    this.isStopped = false;

    // FASE 1: Submódulos de Telemetria Expandida, Ring Buffer e Histórico
    this.networkMonitor = this.options.networkMonitor || new NetworkMonitor({
      autoStart: false,
      host: this.options.networkHost || '1.1.1.1',
      intervalMs: this.options.networkIntervalMs || 4000,
    });

    this.processMonitor = this.options.processMonitor || new ProcessMonitor(systemInfoModule);
    this.sessionBenchmark = this.options.sessionBenchmark || new SessionBenchmark(this.options.benchmark || {});
    this.thermalHistory = this.options.thermalHistory || new ThermalHistoryStore(this.options.thermalDbPath);

    this.lastThermalSampleRecord = 0;
    this.lastDegradationCheck = 0;
    this.cachedDegradationResult = null;

    // Repassa eventos de sessão concluída e salva no SQLite
    this.sessionBenchmark.on('SESSION_REPORT_READY', (report) => {
      try {
        if (this.thermalHistory) {
          this.thermalHistory.saveSessionReport(report);
        }
      } catch (err) {
        console.error('[SystemCollector] Erro ao salvar sessão no histórico térmico:', err);
      }
      this.emit('SESSION_REPORT_READY', report);
    });

    if (!this.isCustomModule) {
      this.initBridge();
      if (this.options.autoStartNetwork !== false) {
        this.networkMonitor.start();
      }
    }
  }

  initBridge() {
    if (this.bridgeProcess || this.isCustomModule || this.isStopped) return;

    const possiblePaths = [
      path.join(__dirname, '../../tools/LibreHardwareMonitor/pc-sensor-bridge.exe'),
      path.join(process.cwd(), 'tools/LibreHardwareMonitor/pc-sensor-bridge.exe'),
      path.join(process.resourcesPath || '', 'tools/LibreHardwareMonitor/pc-sensor-bridge.exe'),
    ];

    let bridgeExe = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        bridgeExe = p;
        break;
      }
    }

    if (!bridgeExe) return;

    try {
      this.bridgeProcess = spawn(bridgeExe, ['--stream'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      let buffer = '';

      this.bridgeProcess.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Mantém pedaço incompleto no buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const data = JSON.parse(trimmed);
              if (data && data.success) {
                this.latestBridgeData = data;
                this.lastBridgeUpdate = Date.now();
                this.isBridgeActive = true;
              }
            } catch {}
          }
        }
      });

      this.bridgeProcess.on('error', () => {
        this.bridgeProcess = null;
        this.isBridgeActive = false;
      });

      this.bridgeProcess.on('exit', () => {
        this.bridgeProcess = null;
        this.isBridgeActive = false;
        if (!this.isStopped) {
          setTimeout(() => this.initBridge(), 6000);
        }
      });
    } catch {
      this.bridgeProcess = null;
    }
  }

  async pollLhmWebServer() {
    const now = Date.now();
    if (now - this.lastLhmCheck < 2500) {
      return this.latestLhmData;
    }
    this.lastLhmCheck = now;

    return new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:8085/data.json', { timeout: 350 }, (res) => {
        if (res.statusCode !== 200) {
          resolve(this.latestLhmData);
          return;
        }
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const parsed = this._parseLhmTree(json);
            if (parsed) {
              this.latestLhmData = parsed;
            }
            resolve(this.latestLhmData);
          } catch {
            resolve(this.latestLhmData);
          }
        });
      });

      req.on('error', () => resolve(this.latestLhmData));
      req.on('timeout', () => {
        req.destroy();
        resolve(this.latestLhmData);
      });
    });
  }

  _parseLhmTree(root) {
    if (!root || !root.children) return null;
    let cpuTemp = null;
    let gpuTemp = null;
    let fanRpm = null;

    const walk = (node) => {
      if (!node) return;
      const text = (node.text || '').toLowerCase();

      if (node.Value && typeof node.Value === 'string' && node.Value.includes('°C')) {
        const val = parseFloat(node.Value.replace(',', '.'));
        if (!isNaN(val) && val > 0) {
          if (text.includes('tctl') || text.includes('package') || text.includes('cpu core') || text.includes('cpu total')) {
            if (cpuTemp === null || text.includes('tctl')) cpuTemp = val;
          } else if (text.includes('gpu core') || (text.includes('gpu') && text.includes('temperature')) || text.includes('gpu vr soc') || text.includes('gpu soc')) {
            if (gpuTemp === null || text.includes('gpu core')) gpuTemp = val;
          }
        }
      }

      if (node.Value && typeof node.Value === 'string' && node.Value.includes('RPM')) {
        const val = parseFloat(node.Value.replace(',', '.'));
        if (!isNaN(val) && val > 0 && fanRpm === null) {
          fanRpm = val;
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          walk(child);
        }
      }
    };

    walk(root);
    return { cpuTemp, gpuTemp, fanRpm };
  }

  stop() {
    this.isStopped = true;
    if (this.networkMonitor) {
      this.networkMonitor.stop();
    }
    if (this.thermalHistory) {
      this.thermalHistory.close();
    }
    if (this.bridgeProcess) {
      try {
        this.bridgeProcess.kill();
      } catch {}
      this.bridgeProcess = null;
    }
  }

  getCpuModel() {
    try {
      const cpus = os.cpus();
      if (cpus && cpus.length > 0 && cpus[0].model) {
        return cpus[0].model.replace(/\s+/g, ' ').trim();
      }
    } catch {}
    return 'Processador';
  }

  getCpuTimes() {
    try {
      return os.cpus().map((c) => {
        const t = c.times;
        const total = t.user + t.nice + t.sys + t.idle + (t.irq || 0);
        return { total, idle: t.idle };
      });
    } catch {
      return [];
    }
  }

  getNativeCpuLoad() {
    const currentSnap = this.getCpuTimes();
    if (!this.prevCpuSnap || this.prevCpuSnap.length === 0 || currentSnap.length === 0) {
      this.prevCpuSnap = currentSnap;
      return { loadPercent: 0, cores: [] };
    }

    let totalDelta = 0;
    let idleDelta = 0;
    const cores = currentSnap.map((c, i) => {
      const prev = this.prevCpuSnap[i] || c;
      const dTotal = c.total - prev.total;
      const dIdle = c.idle - prev.idle;
      totalDelta += dTotal;
      idleDelta += dIdle;
      return dTotal > 0
        ? Number(Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)).toFixed(1))
        : 0;
    });

    this.prevCpuSnap = currentSnap;
    const overall = totalDelta > 0
      ? Number(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)).toFixed(1))
      : 0;

    return { loadPercent: overall, cores };
  }

  getNativeMemory() {
    const totalBytes = os.totalmem() || 1;
    const freeBytes = os.freemem() || 0;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const totalGB = Number((totalBytes / (1024 * 1024 * 1024)).toFixed(1));
    const usedGB = Number((usedBytes / (1024 * 1024 * 1024)).toFixed(1));
    const percentUsed = Number(((usedBytes / totalBytes) * 100).toFixed(1));

    return { totalGB, usedGB, percentUsed };
  }

  getSi() {
    if (!this.si) {
      this.si = require('systeminformation');
    }
    return this.si;
  }

  async getMetricsSnapshot() {
    // Compatibilidade total para suíte de testes unitários com mock
    if (this.isCustomModule) {
      return this._getMockSnapshot();
    }

    const now = Date.now();
    const si = this.getSi();

    // 1. CPU e Memória obtidos nativamente via V8/libuv (0 subprocessos, ~0.1ms)
    const cpuMetrics = this.getNativeCpuLoad();
    const memMetrics = this.getNativeMemory();

    // 2. Coleta de dados reais de sensores (Bridge C# nativo / LHM WebServer)
    const bridgeValid = this.latestBridgeData && (now - this.lastBridgeUpdate < 4500);
    const lhmData = await this.pollLhmWebServer();

    let realCpuTemp = null;
    let realGpuTemp = null;
    let realGpuName = null;
    let realFanRpm = null;

    if (bridgeValid && typeof this.latestBridgeData.cpu?.temp === 'number' && this.latestBridgeData.cpu.temp > 0) {
      realCpuTemp = Number(this.latestBridgeData.cpu.temp.toFixed(1));
    } else if (typeof lhmData?.cpuTemp === 'number' && lhmData.cpuTemp > 0) {
      realCpuTemp = Number(lhmData.cpuTemp.toFixed(1));
    }

    if (bridgeValid && typeof this.latestBridgeData.gpu?.temp === 'number' && this.latestBridgeData.gpu.temp > 0) {
      realGpuTemp = Number(this.latestBridgeData.gpu.temp.toFixed(1));
    } else if (typeof lhmData?.gpuTemp === 'number' && lhmData.gpuTemp > 0) {
      realGpuTemp = Number(lhmData.gpuTemp.toFixed(1));
    }

    if (bridgeValid && this.latestBridgeData.gpu?.name && this.latestBridgeData.gpu.name !== 'GPU') {
      realGpuName = this.latestBridgeData.gpu.name;
    }

    if (typeof lhmData?.fanRpm === 'number' && lhmData.fanRpm > 0) {
      realFanRpm = Math.round(lhmData.fanRpm);
    } else if (bridgeValid && typeof this.latestBridgeData.fanRpm === 'number' && this.latestBridgeData.fanRpm > 0) {
      realFanRpm = Math.round(this.latestBridgeData.fanRpm);
    } else if (bridgeValid && typeof this.latestBridgeData.gpu?.fanRpm === 'number' && this.latestBridgeData.gpu.fanRpm > 0) {
      realFanRpm = Math.round(this.latestBridgeData.gpu.fanRpm);
    }

    // 3. GPU (consulta nativa fallback se não houver bridge)
    if (!realGpuTemp && (!this.cachedGfx || now - this.lastGfxCheck > 60000)) {
      try {
        const gfxData = await si.graphics();
        if (gfxData && gfxData.controllers && gfxData.controllers.length > 0) {
          const primaryGpu = gfxData.controllers[0];
          this.cachedGfx = {
            gpuName: primaryGpu.model || primaryGpu.name || 'GPU',
            gpuTemp: typeof primaryGpu.temperatureGpu === 'number' && !isNaN(primaryGpu.temperatureGpu)
              ? Number(primaryGpu.temperatureGpu.toFixed(1))
              : null,
          };
        } else {
          this.cachedGfx = { gpuName: 'GPU', gpuTemp: null };
        }
      } catch {
        this.cachedGfx = this.cachedGfx || { gpuName: 'GPU', gpuTemp: null };
      }
      this.lastGfxCheck = now;
    }

    // 4. Discos (fsSize): Consulta espaçada a cada 30 segundos.
    if (!this.cachedDisks || this.cachedDisks.length === 0 || now - this.lastDisksCheck > 30000) {
      try {
        const fsData = await si.fsSize();
        this.cachedDisks = (fsData || []).map((disk) => ({
          fs: disk.fs || disk.mount,
          mount: disk.mount || disk.fs,
          type: disk.type,
          sizeGB: Number(((disk.size || 0) / (1024 * 1024 * 1024)).toFixed(1)),
          usedGB: Number(((disk.used || 0) / (1024 * 1024 * 1024)).toFixed(1)),
          percentUsed: Number((disk.use || 0).toFixed(1)),
        }));
      } catch {
        this.cachedDisks = this.cachedDisks || [];
      }
      this.lastDisksCheck = now;
    }

    // 5. Temperaturas da CPU (consulta WMI apenas se não houver dados reais do bridge)
    let tempData = this.cachedTemp;
    if (!realCpuTemp) {
      const shouldCheckTemp =
        this.hasWorkingTempSensor === null ||
        (this.hasWorkingTempSensor === true && now - this.lastTempCheck > 3000) ||
        (this.hasWorkingTempSensor === false && now - this.lastTempCheck > 60000);

      if (shouldCheckTemp) {
        try {
          tempData = await si.cpuTemperature();
          this.cachedTemp = tempData;
          if (typeof tempData.main === 'number' && !isNaN(tempData.main)) {
            this.hasWorkingTempSensor = true;
          } else if (this.hasWorkingTempSensor === null) {
            this.hasWorkingTempSensor = false;
          }
        } catch {
          if (this.hasWorkingTempSensor === null) {
            this.hasWorkingTempSensor = false;
          }
        }
        this.lastTempCheck = now;
      }
    }

    // Telemetria Térmica Real (zero simulações e zero curvas sintéticas)
    let directCpuTemp = realCpuTemp;
    if (directCpuTemp === null && typeof tempData?.main === 'number' && !isNaN(tempData.main)) {
      directCpuTemp = Number(tempData.main.toFixed(1));
    }

    let directGpuTemp = realGpuTemp !== null
      ? realGpuTemp
      : (typeof this.cachedGfx?.gpuTemp === 'number' ? this.cachedGfx.gpuTemp : null);

    const isCpuEstimated = directCpuTemp === null;
    const isGpuEstimated = directGpuTemp === null;
    const isEstimated = isCpuEstimated || isGpuEstimated;
    this.hasWorkingTempSensor = !isCpuEstimated;

    const cpuMaxTemp = (!isCpuEstimated && typeof tempData?.max === 'number' && !isNaN(tempData.max))
      ? Number(tempData.max.toFixed(1))
      : directCpuTemp;

    // Velocidade de ventoinha física real (se disponível pelo hardware)
    let fanRpm = realFanRpm;
    let pwmPercent = null;
    if (fanRpm !== null && fanRpm >= 0) {
      pwmPercent = Math.min(100, Math.max(0, Math.round((fanRpm / 2400) * 100)));
    }

    // Taxa física real de I/O de disco via contadores do SO (bytes/s -> MB/s)
    let readMBps = 0.0;
    let writeMBps = 0.0;
    let hasRealDiskIo = false;
    if (bridgeValid && this.latestBridgeData.diskIo) {
      const rBytes = Number(this.latestBridgeData.diskIo.readBytesSec) || 0;
      const wBytes = Number(this.latestBridgeData.diskIo.writeBytesSec) || 0;
      readMBps = Number((rBytes / (1024 * 1024)).toFixed(1));
      writeMBps = Number((wBytes / (1024 * 1024)).toFixed(1));
      hasRealDiskIo = true;
    }

    const gpuNameResolved = realGpuName || this.cachedGfx?.gpuName || 'GPU Primária';

    // Motherboard e Armazenamento físico
    const motherboardData = (bridgeValid && this.latestBridgeData.motherboard) ? {
      name: this.latestBridgeData.motherboard.name || 'Placa-mãe',
      temp: typeof this.latestBridgeData.motherboard.temp === 'number' ? Number(this.latestBridgeData.motherboard.temp.toFixed(1)) : null,
      requiresElevation: Boolean(this.latestBridgeData.motherboard.requiresElevation),
    } : {
      name: 'Placa-mãe',
      temp: null,
      requiresElevation: true,
    };

    const storageData = (bridgeValid && this.latestBridgeData.storage) ? {
      name: this.latestBridgeData.storage.name || 'Armazenamento',
      temp: typeof this.latestBridgeData.storage.temp === 'number' ? Number(this.latestBridgeData.storage.temp.toFixed(1)) : null,
      load: typeof this.latestBridgeData.storage.load === 'number' ? Number(this.latestBridgeData.storage.load.toFixed(1)) : null,
      requiresElevation: Boolean(this.latestBridgeData.storage.requiresElevation),
    } : {
      name: 'Armazenamento',
      temp: null,
      load: null,
      requiresElevation: true,
    };

    const isAdmin = bridgeValid ? Boolean(this.latestBridgeData.isAdmin) : false;

    // 6. Processos, Swap, Gargalos, Rede e Ring Buffer
    const [topProcesses, swapMetrics] = await Promise.all([
      this.processMonitor.getTopProcesses().catch(() => []),
      this.processMonitor.getSwapMetrics().catch(() => ({ totalMB: 0, usedMB: 0, percentUsed: 0 })),
    ]);

    const networkMetrics = this.networkMonitor ? this.networkMonitor.getMetrics() : {
      latencyMs: 0,
      jitterMs: 0,
      packetLossPercent: 0,
      host: '1.1.1.1',
      status: 'idle',
    };

    const gpuLoadVal = (bridgeValid && typeof this.latestBridgeData.gpu?.load === 'number')
      ? this.latestBridgeData.gpu.load
      : null;

    const vramPercentVal = (bridgeValid && this.latestBridgeData.gpu?.vramTotalMB && this.latestBridgeData.gpu?.vramUsedMB)
      ? Number(((this.latestBridgeData.gpu.vramUsedMB / this.latestBridgeData.gpu.vramTotalMB) * 100).toFixed(1))
      : (bridgeValid && this.latestBridgeData.gpu?.vramTotal && this.latestBridgeData.gpu?.vramUsed
        ? Number(((this.latestBridgeData.gpu.vramUsed / this.latestBridgeData.gpu.vramTotal) * 100).toFixed(1))
        : null);

    const bottleneck = ProcessMonitor.detectBottleneck({
      cpuLoad: cpuMetrics.loadPercent,
      gpuLoad: gpuLoadVal,
      ramPercent: memMetrics.percentUsed,
      swapPercent: swapMetrics.percentUsed,
      vramPercent: vramPercentVal,
    });

    const sessionState = this.sessionBenchmark.feedSample({
      timestamp: now,
      cpuTemp: directCpuTemp,
      gpuTemp: directGpuTemp,
      cpuLoad: cpuMetrics.loadPercent,
      gpuLoad: gpuLoadVal,
      ramPercent: memMetrics.percentUsed,
      ramUsedGB: memMetrics.usedGB,
      bottleneck,
    });

    // Registra agregados térmicos diários com espaçamento inteligente
    if (now - this.lastThermalSampleRecord > 15000) {
      this.lastThermalSampleRecord = now;
      const isIdle = cpuMetrics.loadPercent < 35;
      if (directCpuTemp !== null && directCpuTemp > 0) {
        this.thermalHistory.recordDailyAggregate(directCpuTemp, isIdle);
      }
    }

    // Consulta degradação térmica em repouso (cacheada para 10 minutos)
    if (!this.cachedDegradationResult || now - this.lastDegradationCheck > 600000) {
      this.lastDegradationCheck = now;
      this.cachedDegradationResult = this.thermalHistory.checkThermalDegradation();
    }

    return {
      timestamp: now,
      temperatures: {
        cpuMain: directCpuTemp,
        cpuMax: cpuMaxTemp,
        cores: (!isCpuEstimated && tempData?.cores && tempData.cores.length > 0) ? tempData.cores : (directCpuTemp !== null ? [directCpuTemp] : []),
        gpu: directGpuTemp,
        gpuName: gpuNameResolved,
        gpuMemoryTemp: bridgeValid && typeof this.latestBridgeData.gpu?.memoryTemp === 'number' ? this.latestBridgeData.gpu.memoryTemp : null,
        gpuHotspotTemp: bridgeValid && typeof this.latestBridgeData.gpu?.hotspotTemp === 'number' ? this.latestBridgeData.gpu.hotspotTemp : null,
        gpuFanRpm: bridgeValid && typeof this.latestBridgeData.gpu?.fanRpm === 'number' ? this.latestBridgeData.gpu.fanRpm : null,
        gpuPowerWatts: bridgeValid && typeof this.latestBridgeData.gpu?.powerWatts === 'number' ? this.latestBridgeData.gpu.powerWatts : null,
        gpuVramUsedMB: bridgeValid && typeof this.latestBridgeData.gpu?.vramUsedMB === 'number' ? this.latestBridgeData.gpu.vramUsedMB : null,
        gpuVramTotalMB: bridgeValid && typeof this.latestBridgeData.gpu?.vramTotalMB === 'number' ? this.latestBridgeData.gpu.vramTotalMB : null,
        cpuName: (bridgeValid && this.latestBridgeData.cpu?.name) ? this.latestBridgeData.cpu.name : this.cpuModel,
        motherboard: motherboardData,
        storage: storageData,
        isAdmin,
        requiresElevation: !isAdmin,
        isEstimated: isEstimated,
        isCpuEstimated: isCpuEstimated,
        isGpuEstimated: isGpuEstimated,
      },
      cpu: {
        ...cpuMetrics,
        model: (bridgeValid && this.latestBridgeData.cpu?.name) ? this.latestBridgeData.cpu.name : this.cpuModel,
        brand: (bridgeValid && this.latestBridgeData.cpu?.name) ? this.latestBridgeData.cpu.name : this.cpuModel,
      },
      memory: memMetrics,
      swap: swapMetrics,
      disks: this.cachedDisks,
      network: networkMetrics,
      processes: topProcesses,
      bottleneck,
      sessionBenchmark: {
        state: sessionState.state,
        ringStats: sessionState.ringStats,
        lastReport: sessionState.lastReport,
      },
      degradationAlert: this.cachedDegradationResult,
      fan: {
        rpm: fanRpm,
        pwmPercent: pwmPercent !== null ? pwmPercent : 0,
        maxRpm: 2400,
        isReal: fanRpm !== null,
      },
      diskIo: {
        readMBps,
        writeMBps,
        isReal: hasRealDiskIo,
      },
    };
  }

  async _getMockSnapshot() {
    const si = this.getSi();
    const [tempData, loadData, memData, gfxData, fsData] = await Promise.all([
      si.cpuTemperature().catch(() => ({ main: null, cores: [], max: null })),
      si.currentLoad().catch(() => ({ currentLoad: 0, cpus: [] })),
      si.mem().catch(() => ({ total: 1, used: 0, free: 0 })),
      si.graphics().catch(() => ({ controllers: [] })),
      si.fsSize().catch(() => []),
    ]);

    const cpuMainTemp = typeof tempData.main === 'number' && !isNaN(tempData.main)
      ? Number(tempData.main.toFixed(1))
      : null;
    const cpuMaxTemp = typeof tempData.max === 'number' && !isNaN(tempData.max)
      ? Number(tempData.max.toFixed(1))
      : cpuMainTemp;

    let gpuTemp = null;
    let gpuName = 'N/A';
    if (gfxData && gfxData.controllers && gfxData.controllers.length > 0) {
      const primaryGpu = gfxData.controllers[0];
      gpuName = primaryGpu.model || primaryGpu.name || 'GPU';
      if (typeof primaryGpu.temperatureGpu === 'number' && !isNaN(primaryGpu.temperatureGpu)) {
        gpuTemp = Number(primaryGpu.temperatureGpu.toFixed(1));
      }
    }

    const totalBytes = memData.total || 1;
    const usedBytes = memData.used || 0;
    const totalGB = Number((totalBytes / (1024 * 1024 * 1024)).toFixed(1));
    const usedGB = Number((usedBytes / (1024 * 1024 * 1024)).toFixed(1));
    const percentUsed = Number(((usedBytes / totalBytes) * 100).toFixed(1));

    const disks = (fsData || []).map((disk) => ({
      fs: disk.fs || disk.mount,
      mount: disk.mount || disk.fs,
      type: disk.type,
      sizeGB: Number(((disk.size || 0) / (1024 * 1024 * 1024)).toFixed(1)),
      usedGB: Number(((disk.used || 0) / (1024 * 1024 * 1024)).toFixed(1)),
      percentUsed: Number((disk.use || 0).toFixed(1)),
    }));

    const [topProcesses, swapMetrics] = await Promise.all([
      this.processMonitor.getTopProcesses().catch(() => []),
      this.processMonitor.getSwapMetrics().catch(() => ({ totalMB: 0, usedMB: 0, percentUsed: 0 })),
    ]);

    const networkMetrics = this.networkMonitor ? this.networkMonitor.getMetrics() : {
      latencyMs: 0,
      jitterMs: 0,
      packetLossPercent: 0,
      host: '1.1.1.1',
      status: 'idle',
    };

    const cpuLoadVal = Number((loadData.currentLoad || 0).toFixed(1));
    const bottleneck = ProcessMonitor.detectBottleneck({
      cpuLoad: cpuLoadVal,
      gpuLoad: null,
      ramPercent: percentUsed,
      swapPercent: swapMetrics.percentUsed,
      vramPercent: null,
    });

    const sessionState = this.sessionBenchmark.feedSample({
      timestamp: Date.now(),
      cpuTemp: cpuMainTemp,
      gpuTemp,
      cpuLoad: cpuLoadVal,
      gpuLoad: null,
      ramPercent: percentUsed,
      ramUsedGB: usedGB,
      bottleneck,
    });

    if (!this.cachedDegradationResult) {
      this.cachedDegradationResult = this.thermalHistory.checkThermalDegradation();
    }

    return {
      timestamp: Date.now(),
      temperatures: {
        cpuMain: cpuMainTemp,
        cpuMax: cpuMaxTemp,
        cores: tempData.cores || [],
        gpu: gpuTemp,
        gpuName: gpuName,
        cpuName: this.cpuModel,
        isEstimated: cpuMainTemp === null,
        isCpuEstimated: cpuMainTemp === null,
        isGpuEstimated: gpuTemp === null,
      },
      cpu: {
        loadPercent: cpuLoadVal,
        cores: (loadData.cpus || []).map((c) => Number((c.load || 0).toFixed(1))),
        model: this.cpuModel,
        brand: this.cpuModel,
      },
      memory: {
        totalGB,
        usedGB,
        percentUsed,
      },
      swap: swapMetrics,
      disks,
      network: networkMetrics,
      processes: topProcesses,
      bottleneck,
      sessionBenchmark: {
        state: sessionState.state,
        ringStats: sessionState.ringStats,
        lastReport: sessionState.lastReport,
      },
      degradationAlert: this.cachedDegradationResult,
      // Sem bridge de sensores no modo injetado: nada de valores inventados
      fan: {
        rpm: null,
        pwmPercent: 0,
        maxRpm: 2400,
        isReal: false,
      },
      diskIo: {
        readMBps: 0,
        writeMBps: 0,
        isReal: false,
      },
    };
  }

  /**
   * getHardwareInfo
   * Coleta o inventário completo e estático de hardware da máquina com cache e degradação graciosa.
   * Não impacta o loop de métricas em tempo real.
   */
  async getHardwareInfo(forceRefresh = false) {
    if (this.cachedHardwareInfo && !forceRefresh) {
      return this.cachedHardwareInfo;
    }

    const si = this.getSi();

    // Executa em paralelo com tratamento de erros gracioso retornando null
    const [
      osInfo,
      system,
      baseboard,
      bios,
      cpuInfo,
      memLayout,
      memData,
      graphics,
      diskLayout,
      fsData,
      netInterfaces,
    ] = await Promise.all([
      si.osInfo ? si.osInfo().catch(() => ({})) : Promise.resolve({}),
      si.system ? si.system().catch(() => ({})) : Promise.resolve({}),
      si.baseboard ? si.baseboard().catch(() => ({})) : Promise.resolve({}),
      si.bios ? si.bios().catch(() => ({})) : Promise.resolve({}),
      si.cpu ? si.cpu().catch(() => ({})) : Promise.resolve({}),
      si.memLayout ? si.memLayout().catch(() => ([])) : Promise.resolve([]),
      si.mem ? si.mem().catch(() => ({})) : Promise.resolve({}),
      si.graphics ? si.graphics().catch(() => ({})) : Promise.resolve({}),
      si.diskLayout ? si.diskLayout().catch(() => ([])) : Promise.resolve([]),
      si.fsSize ? si.fsSize().catch(() => ([])) : Promise.resolve([]),
      si.networkInterfaces ? si.networkInterfaces().catch(() => ([])) : Promise.resolve([]),
    ]);

    // Detecção segura de interface ativa de rede sem coletar IP público (Regra de privacidade)
    const validNets = Array.isArray(netInterfaces) ? netInterfaces : [];
    const activeNet = validNets.find(
      (n) => n?.ip4 && !n.internal && n.ip4 !== '127.0.0.1'
    ) || (validNets.length > 0 ? validNets[0] : null);

    // Mapeamento de GPUs (suporte a múltiplas placas)
    let gpusList = [];
    if (graphics?.controllers && Array.isArray(graphics.controllers) && graphics.controllers.length > 0) {
      gpusList = graphics.controllers.map((g) => {
        let vendor = null;
        const v = (g?.vendor || '').toUpperCase();
        const m = (g?.model || g?.name || '').toUpperCase();
        if (v.includes('NVIDIA') || m.includes('NVIDIA') || m.includes('GEFORCE')) vendor = 'NVIDIA';
        else if (v.includes('AMD') || v.includes('ADVANCED MICRO') || m.includes('RADEON') || m.includes('AMD')) vendor = 'AMD';
        else if (v.includes('INTEL') || m.includes('INTEL') || m.includes('ARC') || m.includes('IRIS') || m.includes('UHD')) vendor = 'Intel';

        const vramBytes = typeof g?.vram === 'number' && g.vram > 0
          ? Math.round(g.vram * 1024 * 1024)
          : (typeof g?.memoryTotal === 'number' && g.memoryTotal > 0 ? Math.round(g.memoryTotal * 1024 * 1024) : null);

        return {
          vendor: vendor || (g?.vendor ? 'Outro' : null),
          name: g?.model || g?.name || null,
          vramTotalBytes: vramBytes,
          driverVersion: g?.driverVersion || null,
          bus: g?.bus || null,
        };
      });
    } else if (this.cachedGfx?.gpuName) {
      gpusList = [
        {
          vendor: this.cachedGfx.gpuName.includes('NVIDIA') ? 'NVIDIA' : 'AMD',
          name: this.cachedGfx.gpuName,
          vramTotalBytes: null,
          driverVersion: null,
          bus: 'PCIe',
        },
      ];
    }

    // Mapeamento dos slots físicos de memória RAM
    const ramSlots = Array.isArray(memLayout) && memLayout.length > 0
      ? memLayout
          .filter((s) => s && (s.size || s.bank || s.partNum))
          .map((s, idx) => ({
            slot: s.bank || `Slot ${idx + 1}`,
            capacityBytes: typeof s.size === 'number' && s.size > 0 ? s.size : null,
            manufacturer: s.manufacturer && s.manufacturer !== 'Unknown' && s.manufacturer.trim() !== '' ? s.manufacturer : null,
            partNumber: s.partNum && s.partNum !== 'Unknown' && s.partNum.trim() !== '' ? s.partNum : null,
            speedMHz: typeof s.clockSpeed === 'number' && s.clockSpeed > 0 ? s.clockSpeed : null,
          }))
      : [];

    // Mapeamento de discos
    const rawDisks = Array.isArray(fsData) && fsData.length > 0 ? fsData : (this.cachedDisks.length > 0 ? this.cachedDisks : []);
    const validDiskLayout = Array.isArray(diskLayout) ? diskLayout : [];
    const disksList = rawDisks.map((d, i) => {
      const phys = validDiskLayout.find(
        (p) => (d?.fs && p?.device && d.fs.startsWith(p.device)) || (d?.mount && p?.name && d.mount.startsWith(p.name))
      ) || (validDiskLayout[i] ? validDiskLayout[i] : (validDiskLayout[0] || null));

      const typeRaw = (phys?.interfaceType || phys?.type || d?.type || '').toUpperCase();
      let diskType = 'SSD';
      if (typeRaw.includes('NVME') || (phys?.name || '').toUpperCase().includes('NVME')) {
        diskType = 'NVMe';
      } else if (typeRaw.includes('HDD') || typeRaw.includes('HARD') || phys?.type === 'HD') {
        diskType = 'HDD';
      }

      const totalB = typeof d?.size === 'number' && d.size > 0 
        ? d.size 
        : (typeof d?.sizeGB === 'number' ? Math.round(d.sizeGB * 1024 * 1024 * 1024) : (typeof phys?.size === 'number' ? phys.size : null));

      return {
        id: d?.fs || d?.mount || `Disco ${i + 1}`,
        label: d?.mount || d?.fs || null,
        type: diskType,
        totalBytes: totalB,
        fs: d?.type || 'NTFS',
        fsType: d?.type || 'NTFS',
        model: phys?.name || phys?.vendor || 'Unidade de Disco',
      };
    });

    let timeInfo = null;
    try {
      timeInfo = typeof si.time === 'function' ? si.time() : null;
    } catch (_) {
      timeInfo = null;
    }
    const uptimeSec = (typeof timeInfo?.uptime === 'number' && timeInfo.uptime > 0)
      ? Math.floor(timeInfo.uptime)
      : (typeof os.uptime === 'function' && os.uptime() > 0 ? Math.floor(os.uptime()) : null);

    const mbManufacturer = (baseboard?.manufacturer && !baseboard.manufacturer.includes('Default') && baseboard.manufacturer.trim() !== '')
      ? baseboard.manufacturer
      : ((system?.manufacturer && system.manufacturer.trim() !== '') ? system.manufacturer : null);

    const mbModel = (baseboard?.model && !baseboard.model.includes('Default') && baseboard.model.trim() !== '')
      ? baseboard.model
      : ((system?.model && system.model.trim() !== '') ? system.model : null);

    const cpuBrand = (cpuInfo?.brand && cpuInfo.brand.trim() !== '')
      ? cpuInfo.brand
      : null;

    const ramTotal = (typeof memData?.total === 'number' && memData.total > 0)
      ? memData.total
      : (ramSlots.length > 0 
          ? ramSlots.reduce((acc, s) => acc + (s.capacityBytes || 0), 0) 
          : null);

    const info = {
      os: {
        osName: (osInfo?.distro && osInfo.distro.trim() !== '') ? osInfo.distro : null,
        build: (osInfo?.build && osInfo.build.trim() !== '') ? osInfo.build : null,
        arch: osInfo?.arch || null,
        hostname: (osInfo?.hostname && osInfo.hostname.trim() !== '') ? osInfo.hostname : null,
        agentVersion: '0.1.0',
        uptimeSeconds: uptimeSec,
      },
      motherboard: {
        manufacturer: mbManufacturer,
        model: mbModel,
        biosVersion: (bios?.version && bios.version.trim() !== '') ? bios.version : null,
        biosDate: (bios?.releaseDate && bios.releaseDate.trim() !== '') ? bios.releaseDate : null,
      },
      cpu: {
        name: cpuBrand,
        cores: typeof cpuInfo?.physicalCores === 'number' && cpuInfo.physicalCores > 0 
          ? cpuInfo.physicalCores 
          : null,
        threads: typeof cpuInfo?.cores === 'number' && cpuInfo.cores > 0 
          ? cpuInfo.cores 
          : null,
        baseSpeedMHz: typeof cpuInfo?.speed === 'number' && cpuInfo.speed > 0 
          ? Math.round(cpuInfo.speed * (cpuInfo.speed < 100 ? 1000 : 1)) 
          : null,
        maxSpeedMHz: typeof cpuInfo?.speedMax === 'number' && cpuInfo.speedMax > 0 
          ? Math.round(cpuInfo.speedMax * (cpuInfo.speedMax < 100 ? 1000 : 1)) 
          : null,
        socket: (cpuInfo?.socket && cpuInfo.socket !== 'None' && cpuInfo.socket.trim() !== '') ? cpuInfo.socket : null,
        l1CacheBytes: (cpuInfo?.cache?.l1d ? (cpuInfo.cache.l1d + (cpuInfo.cache.l1i || 0)) : null) || null,
        l2CacheBytes: (typeof cpuInfo?.cache?.l2 === 'number' && cpuInfo.cache.l2 > 0) ? cpuInfo.cache.l2 : null,
        l3CacheBytes: (typeof cpuInfo?.cache?.l3 === 'number' && cpuInfo.cache.l3 > 0) ? cpuInfo.cache.l3 : null,
      },
      gpus: gpusList,
      ram: {
        totalBytes: ramTotal,
        type: ramSlots[0]?.type || (memLayout?.[0]?.type) || (ramSlots.length > 0 ? 'DDR5' : null),
        speedMHz: ramSlots[0]?.speedMHz || (typeof memLayout?.[0]?.clockSpeed === 'number' && memLayout[0].clockSpeed > 0 ? memLayout[0].clockSpeed : null),
        channelMode: ramSlots.length >= 4 ? 'Quad Channel' : (ramSlots.length >= 2 ? 'Dual Channel' : (ramSlots.length === 1 ? 'Single Channel' : null)),
        slots: ramSlots,
      },
      disks: disksList,
      network: {
        interface: activeNet?.iface || null,
        localIp: (activeNet?.ip4 && activeNet.ip4 !== '127.0.0.1') ? activeNet.ip4 : null,
        type: activeNet?.type === 'wireless' ? 'Wi-Fi' : (activeNet?.type ? 'Ethernet' : null),
        macAddress: activeNet?.mac || null,
        linkSpeedMbps: typeof activeNet?.speed === 'number' && activeNet.speed > 0 ? activeNet.speed : null,
      },
      capabilities: {
        cpuTemperature: this.hasWorkingTempSensor === true || (this.latestBridgeData?.cpu?.temp != null && this.latestBridgeData.cpu.temp > 0),
        gpuTemperature: Boolean(this.cachedGfx?.gpuTemp !== null || (this.latestBridgeData?.gpu?.temp != null && this.latestBridgeData.gpu.temp > 0)),
        gpuPower: Boolean(this.latestBridgeData?.gpu?.powerWatts != null),
        perCoreLoad: true,
        networkMonitoring: true,
        processMonitoring: true,
        bottleneckDetection: true,
        thermalDegradationHistory: true,
      },
    };

    this.cachedHardwareInfo = info;
    return info;
  }
}

module.exports = {
  SystemCollector,
  NetworkMonitor,
  ProcessMonitor,
  detectBottleneck,
  SessionBenchmark,
  RingBuffer,
  ThermalHistoryStore,
};
