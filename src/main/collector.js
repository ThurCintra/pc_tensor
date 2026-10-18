/**
 * SystemCollector
 * Responsável por coletar e normalizar métricas de hardware, sensores e temperaturas.
 */
class SystemCollector {
  constructor(systemInfoModule = null) {
    this.si = systemInfoModule;
  }

  getSi() {
    if (!this.si) {
      this.si = require('systeminformation');
    }
    return this.si;
  }

  async getMetricsSnapshot() {
    const si = this.getSi();

    const [tempData, loadData, memData, gfxData, fsData] = await Promise.all([
      si.cpuTemperature().catch(() => ({ main: null, cores: [], max: null })),
      si.currentLoad().catch(() => ({ currentLoad: 0, cpus: [] })),
      si.mem().catch(() => ({ total: 1, used: 0, free: 0 })),
      si.graphics().catch(() => ({ controllers: [] })),
      si.fsSize().catch(() => []),
    ]);

    // Processamento de temperaturas
    const cpuMainTemp = typeof tempData.main === 'number' && !isNaN(tempData.main) ? Number(tempData.main.toFixed(1)) : null;
    const cpuMaxTemp = typeof tempData.max === 'number' && !isNaN(tempData.max) ? Number(tempData.max.toFixed(1)) : cpuMainTemp;
    
    let gpuTemp = null;
    let gpuName = 'N/A';
    if (gfxData && gfxData.controllers && gfxData.controllers.length > 0) {
      const primaryGpu = gfxData.controllers[0];
      gpuName = primaryGpu.model || primaryGpu.name || 'GPU';
      if (typeof primaryGpu.temperatureGpu === 'number' && !isNaN(primaryGpu.temperatureGpu)) {
        gpuTemp = Number(primaryGpu.temperatureGpu.toFixed(1));
      }
    }

    // Processamento de Memória
    const totalBytes = memData.total || 1;
    const usedBytes = memData.used || 0;
    const totalGB = Number((totalBytes / (1024 * 1024 * 1024)).toFixed(1));
    const usedGB = Number((usedBytes / (1024 * 1024 * 1024)).toFixed(1));
    const percentUsed = Number(((usedBytes / totalBytes) * 100).toFixed(1));

    // Processamento de Discos
    const disks = (fsData || []).map((disk) => ({
      fs: disk.fs || disk.mount,
      mount: disk.mount || disk.fs,
      type: disk.type,
      sizeGB: Number(((disk.size || 0) / (1024 * 1024 * 1024)).toFixed(1)),
      usedGB: Number(((disk.used || 0) / (1024 * 1024 * 1024)).toFixed(1)),
      percentUsed: Number((disk.use || 0).toFixed(1)),
    }));

    return {
      timestamp: Date.now(),
      temperatures: {
        cpuMain: cpuMainTemp,
        cpuMax: cpuMaxTemp,
        cores: tempData.cores || [],
        gpu: gpuTemp,
        gpuName: gpuName,
        isEstimated: cpuMainTemp === null,
      },
      cpu: {
        loadPercent: Number((loadData.currentLoad || 0).toFixed(1)),
        cores: (loadData.cpus || []).map((c) => Number((c.load || 0).toFixed(1))),
      },
      memory: {
        totalGB,
        usedGB,
        percentUsed,
      },
      disks,
    };
  }
}

module.exports = { SystemCollector };
