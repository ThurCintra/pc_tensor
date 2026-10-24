/**
 * ProcessMonitor & BottleneckDetector
 * Monitor assíncrono não-bloqueante de processos pesados, swap de memória e diagnóstico de gargalos.
 */
class ProcessMonitor {
  constructor(systemInfoModule = null) {
    this.si = systemInfoModule;
    this.lastProcessCheck = 0;
    this.processCheckInterval = 3500; // Coleta espaçada para zero-overhead

    this.cachedProcesses = [];
    this.cachedSwap = {
      totalMB: 0,
      usedMB: 0,
      percentUsed: 0,
    };
    this.cachedDiskIo = {
      readMBps: 0,
      writeMBps: 0,
    };
    this.lastDiskSample = null;
    this.isCollecting = false;
  }

  getSi() {
    if (!this.si) {
      this.si = require('systeminformation');
    }
    return this.si;
  }

  /**
   * Coleta Top 5 processos ordenados por CPU e RAM
   */
  async getTopProcesses(force = false) {
    const now = Date.now();
    if (!force && this.cachedProcesses.length > 0 && now - this.lastProcessCheck < this.processCheckInterval) {
      return this.cachedProcesses;
    }

    if (this.isCollecting) {
      return this.cachedProcesses;
    }

    this.isCollecting = true;
    const si = this.getSi();

    try {
      const data = await si.processes();
      const list = (data?.list || []).filter((p) => p && p.name && p.pid > 4);

      // Pontuação combinada ponderada: 60% CPU + 40% Memória
      const sorted = list
        .map((p) => {
          const cpu = typeof p.cpu === 'number' && !isNaN(p.cpu) ? Number(p.cpu.toFixed(1)) : 0;
          const memMB =
            typeof p.memRss === 'number' && p.memRss > 0
              ? Number((p.memRss / 1024).toFixed(1))
              : typeof p.mem === 'number'
                ? Number(p.mem.toFixed(1))
                : 0;

          return {
            pid: p.pid,
            name: p.name.replace(/\.exe$/i, ''),
            cpuPercent: cpu,
            memoryMB: memMB,
            user: p.user || 'SYSTEM',
            score: cpu * 2 + memMB / 100,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      this.cachedProcesses = sorted;
      this.lastProcessCheck = now;
    } catch {
      // Degradação graciosa mantendo cache anterior
    } finally {
      this.isCollecting = false;
    }

    return this.cachedProcesses;
  }

  /**
   * Coleta métricas de Memória de Paginação (Swap / Pagefile)
   */
  async getSwapMetrics() {
    const si = this.getSi();
    try {
      const mem = await si.mem();
      const totalB = mem?.swaptotal || 0;
      const usedB = mem?.swapused || 0;

      const totalMB = Number((totalB / (1024 * 1024)).toFixed(0));
      const usedMB = Number((usedB / (1024 * 1024)).toFixed(0));
      const percentUsed = totalB > 0 ? Number(((usedB / totalB) * 100).toFixed(1)) : 0;

      this.cachedSwap = {
        totalMB,
        usedMB,
        percentUsed,
      };
    } catch {
      // Fallback gracioso
    }

    return this.cachedSwap;
  }

  /**
   * Detecção Dinâmica de Gargalo de Hardware
   * Cruza carga de CPU, GPU, VRAM e Memória RAM/Swap para diagnosticar o limitador atual.
   */
  static detectBottleneck(metrics = {}) {
    const cpuLoad = typeof metrics.cpuLoad === 'number' ? metrics.cpuLoad : 0;
    const gpuLoad = typeof metrics.gpuLoad === 'number' ? metrics.gpuLoad : null;
    const ramPercent = typeof metrics.ramPercent === 'number' ? metrics.ramPercent : 0;
    const swapPercent = typeof metrics.swapPercent === 'number' ? metrics.swapPercent : 0;
    const vramPercent = typeof metrics.vramPercent === 'number' ? metrics.vramPercent : 0;

    // 1. Risco Iminente de Saturation de Memória / Swap Thrashing
    if (ramPercent >= 90 || swapPercent >= 75) {
      return {
        state: 'RAM_SWAP_RISK',
        label: 'Gargalo de Memória (Risco de Swap)',
        severity: 'critical',
        color: '#FF2A54',
        badgeColor: 'rgba(255, 42, 84, 0.15)',
        description:
          'A memória RAM está saturada e o Windows está paginando intensamente em disco, gerando micro-travamentos (stuttering).',
        recommendations: [
          'Feche navegadores com muitas abas ou programas em segundo plano.',
          'Considere aumentar a quantidade de memória RAM física.',
        ],
      };
    }

    // 2. Pressão Extrema de Memória de Vídeo (VRAM)
    if (vramPercent >= 90) {
      return {
        state: 'VRAM_PRESSURE',
        label: 'Pressão de VRAM na GPU',
        severity: 'warning',
        color: '#FF8A00',
        badgeColor: 'rgba(255, 138, 0, 0.15)',
        description:
          'A memória de vídeo da placa gráfica está quase esgotada, forçando transbordo para a RAM do sistema.',
        recommendations: [
          'Reduza a qualidade das texturas nas configurações gráficas.',
          'Desative Ray Tracing ou diminua a resolução para aliviar o buffer de vídeo.',
        ],
      };
    }

    // 3. Gargalo de Processador (CPU Bound)
    if (cpuLoad >= 85 && (gpuLoad === null || gpuLoad < 65)) {
      return {
        state: 'CPU_BOUND',
        label: 'Gargalo no Processador (CPU Bound)',
        severity: 'warning',
        color: '#FF8A00',
        badgeColor: 'rgba(255, 138, 0, 0.15)',
        description: 'O processador está operando próximo do limite máximo enquanto a GPU aguarda instruções.',
        recommendations: [
          'Aumente a resolução gráfica para transferir o peso de renderização à GPU.',
          'Feche processos em background que consumam ciclos de CPU.',
        ],
      };
    }

    // 4. Gargalo de Placa de Vídeo (GPU Bound - Comportamento Ideal em Jogos)
    if (gpuLoad !== null && gpuLoad >= 90 && cpuLoad < 75) {
      return {
        state: 'GPU_BOUND',
        label: 'Carga Máxima de GPU (GPU Bound)',
        severity: 'optimal',
        color: '#00F0FF',
        badgeColor: 'rgba(0, 240, 255, 0.15)',
        description:
          'A placa gráfica está entregando 100% de sua capacidade com a CPU folgada. Cenário ideal em jogos.',
        recommendations: [
          'Equilíbrio perfeito de renderização gráfica.',
          'Para mais quadros, ative tecnologias de upscaling como FSR/DLSS.',
        ],
      };
    }

    // 5. Sistema Equilibrado
    return {
      state: 'BALANCED',
      label: 'Sistema Equilibrado',
      severity: 'stable',
      color: '#10B981',
      badgeColor: 'rgba(16, 185, 129, 0.15)',
      description: 'Cargas proporcionais entre CPU, GPU e memória sem gargalos ativos detectados.',
      recommendations: ['Recursos de hardware fluindo harmoniosamente.'],
    };
  }
}

module.exports = { ProcessMonitor };
