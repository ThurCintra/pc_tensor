const os = require('os');

const GB = 1024 * 1024 * 1024;

/**
 * Carga de CPU e memória lidas direto do Node (os.cpus / os.totalmem), sem abrir processos.
 * A carga é calculada pela diferença entre duas amostras dos tempos de CPU.
 */
class NativeMetrics {
  constructor({ osModule = os } = {}) {
    this.os = osModule;
    this.cpuModel = this.readCpuModel();
    this.prevCpuSnap = this.readCpuTimes();
  }

  readCpuModel() {
    try {
      const model = this.os.cpus()?.[0]?.model;
      if (model) return model.replace(/\s+/g, ' ').trim();
    } catch {
      // os.cpus pode falhar em ambientes restritos
    }
    return 'Processador';
  }

  readCpuTimes() {
    try {
      return this.os.cpus().map(({ times: t }) => ({
        total: t.user + t.nice + t.sys + t.idle + (t.irq || 0),
        idle: t.idle,
      }));
    } catch {
      return [];
    }
  }

  getCpuLoad() {
    const current = this.readCpuTimes();
    const previous = this.prevCpuSnap;
    this.prevCpuSnap = current;
    if (!previous || previous.length === 0 || current.length === 0) {
      return { loadPercent: 0, cores: [] };
    }

    let totalDelta = 0;
    let idleDelta = 0;
    const cores = current.map((c, i) => {
      const prev = previous[i] || c;
      const dTotal = c.total - prev.total;
      const dIdle = c.idle - prev.idle;
      totalDelta += dTotal;
      idleDelta += dIdle;
      return dTotal > 0 ? toPercent(1 - dIdle / dTotal) : 0;
    });

    return { loadPercent: totalDelta > 0 ? toPercent(1 - idleDelta / totalDelta) : 0, cores };
  }

  getMemory() {
    const totalBytes = this.os.totalmem() || 1;
    const usedBytes = Math.max(0, totalBytes - (this.os.freemem() || 0));
    return {
      totalGB: round1(totalBytes / GB),
      usedGB: round1(usedBytes / GB),
      percentUsed: round1((usedBytes / totalBytes) * 100),
    };
  }
}

function toPercent(ratio) {
  return round1(Math.max(0, Math.min(100, ratio * 100)));
}

function round1(value) {
  return Number(value.toFixed(1));
}

module.exports = { NativeMetrics, round1, GB };
