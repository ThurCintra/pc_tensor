const EventEmitter = require('events');

/**
 * RingBuffer
 * Buffer circular em memória com capacidade fixa (padrão: 900 amostras = 15 minutos @ 1s)
 */
class RingBuffer {
  constructor(capacity = 900) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  toArray() {
    const result = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      const idx = (this.tail + i) % this.capacity;
      result[i] = this.buffer[idx];
    }
    return result;
  }

  getStats() {
    if (this.size === 0) {
      return null;
    }

    const items = this.toArray();

    const calcMinMaxAvg = (getter) => {
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let count = 0;

      for (const item of items) {
        const val = getter(item);
        if (typeof val === 'number' && !isNaN(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
          sum += val;
          count++;
        }
      }

      return {
        min: count > 0 ? Number(min.toFixed(1)) : 0,
        max: count > 0 ? Number(max.toFixed(1)) : 0,
        avg: count > 0 ? Number((sum / count).toFixed(1)) : 0,
        count,
      };
    };

    const firstTime = items[0]?.timestamp || Date.now();
    const lastTime = items[items.length - 1]?.timestamp || Date.now();
    const spanMinutes = Number(((lastTime - firstTime) / 60000).toFixed(1));

    return {
      spanMinutes,
      sampleCount: this.size,
      cpuTemp: calcMinMaxAvg((x) => x.cpuTemp),
      gpuTemp: calcMinMaxAvg((x) => x.gpuTemp),
      cpuLoad: calcMinMaxAvg((x) => x.cpuLoad),
      gpuLoad: calcMinMaxAvg((x) => x.gpuLoad),
      ramPercent: calcMinMaxAvg((x) => x.ramPercent),
      ramUsedGB: calcMinMaxAvg((x) => x.ramUsedGB),
    };
  }

  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
}

/**
 * SessionBenchmark
 * Máquina de estados para diagnóstico de sessões de alta carga (Gaming / Render / Benchmarks).
 * Estados: IDLE -> HIGH_LOAD -> COOLDOWN -> IDLE
 */
class SessionBenchmark extends EventEmitter {
  constructor(options = {}) {
    super();

    this.ringBuffer = new RingBuffer(options.bufferCapacity || 900);

    // Parâmetros de disparo (em ms)
    this.highLoadThreshold = options.highLoadThreshold ?? 65; // %
    this.highLoadDurationMs = options.highLoadDurationMs ?? 180000; // 3 minutos
    this.idleThreshold = options.idleThreshold ?? 40; // %
    this.cooldownDurationMs = options.cooldownDurationMs ?? 60000; // 1 minuto
    this.throttleTempThreshold = options.throttleTempThreshold ?? 85; // °C

    this.state = 'IDLE'; // 'IDLE' | 'HIGH_LOAD' | 'COOLDOWN'
    this.highLoadStartTime = null;
    this.cooldownStartTime = null;
    this.activeSession = null;
    this.lastReport = null;
  }

  feedSample(metrics) {
    const now = metrics.timestamp || Date.now();

    const sample = {
      timestamp: now,
      cpuTemp: metrics.cpuTemp ?? metrics.temperatures?.cpuMain ?? null,
      gpuTemp: metrics.gpuTemp ?? metrics.temperatures?.gpu ?? null,
      cpuLoad: metrics.cpuLoad ?? metrics.cpu?.loadPercent ?? 0,
      gpuLoad: metrics.gpuLoad ?? null,
      ramPercent: metrics.ramPercent ?? metrics.memory?.percentUsed ?? 0,
      ramUsedGB: metrics.ramUsedGB ?? metrics.memory?.usedGB ?? 0,
      isThrottling: metrics.cpuTemp >= this.throttleTempThreshold || metrics.gpuTemp >= this.throttleTempThreshold,
      bottleneckState: metrics.bottleneck?.state || 'BALANCED',
    };

    // Armazena no RingBuffer de 15 minutos
    this.ringBuffer.push(sample);

    const isHighNow =
      sample.cpuLoad >= this.highLoadThreshold || (sample.gpuLoad !== null && sample.gpuLoad >= this.highLoadThreshold);
    const isIdleNow =
      sample.cpuLoad < this.idleThreshold && (sample.gpuLoad === null || sample.gpuLoad < this.idleThreshold);

    switch (this.state) {
      case 'IDLE':
        if (isHighNow) {
          if (!this.highLoadStartTime) {
            this.highLoadStartTime = now;
          } else if (now - this.highLoadStartTime >= this.highLoadDurationMs) {
            // Gatilho de entrada na sessão de alta performance
            this.state = 'HIGH_LOAD';
            this.activeSession = {
              id: `session_${now}`,
              startTime: this.highLoadStartTime,
              samples: [sample],
              throttlingCount: sample.isThrottling ? 1 : 0,
              bottleneckFrequency: { [sample.bottleneckState]: 1 },
            };
            this.emit('SESSION_STATE_CHANGED', { state: this.state, session: this.activeSession });
          }
        } else {
          this.highLoadStartTime = null;
        }
        break;

      case 'HIGH_LOAD':
        if (this.activeSession) {
          this.activeSession.samples.push(sample);
          if (sample.isThrottling) {
            this.activeSession.throttlingCount++;
          }
          const bState = sample.bottleneckState;
          this.activeSession.bottleneckFrequency[bState] = (this.activeSession.bottleneckFrequency[bState] || 0) + 1;
        }

        if (isIdleNow) {
          this.state = 'COOLDOWN';
          this.cooldownStartTime = now;
          this.emit('SESSION_STATE_CHANGED', { state: this.state, cooldownStartTime: now });
        }
        break;

      case 'COOLDOWN':
        if (this.activeSession) {
          this.activeSession.samples.push(sample);
          if (sample.isThrottling) {
            this.activeSession.throttlingCount++;
          }
        }

        if (isHighNow) {
          // Cancelou cooldown, voltou para alta carga
          this.state = 'HIGH_LOAD';
          this.cooldownStartTime = null;
          this.emit('SESSION_STATE_CHANGED', { state: this.state, reason: 'LOAD_RESUMED' });
        } else if (now - this.cooldownStartTime >= this.cooldownDurationMs) {
          // Concluiu a sessão! Gera o relatório pós-sessão
          const report = this.finalizeSession(now);
          this.state = 'IDLE';
          this.highLoadStartTime = null;
          this.cooldownStartTime = null;
          this.activeSession = null;
          this.lastReport = report;

          this.emit('SESSION_REPORT_READY', report);
          this.emit('SESSION_STATE_CHANGED', { state: this.state, lastReport: report });
        }
        break;
    }

    return {
      state: this.state,
      ringStats: this.ringBuffer.getStats(),
      lastReport: this.lastReport,
    };
  }

  finalizeSession(endTime) {
    if (!this.activeSession || this.activeSession.samples.length === 0) {
      return null;
    }

    const samples = this.activeSession.samples;
    const startTime = this.activeSession.startTime;
    const durationSeconds = Math.max(1, Math.round((endTime - startTime) / 1000));

    const calcStats = (getter) => {
      let max = -Infinity;
      let sum = 0;
      let count = 0;
      for (const s of samples) {
        const val = getter(s);
        if (typeof val === 'number' && !isNaN(val)) {
          if (val > max) max = val;
          sum += val;
          count++;
        }
      }
      return {
        peak: count > 0 ? Number(max.toFixed(1)) : 0,
        avg: count > 0 ? Number((sum / count).toFixed(1)) : 0,
      };
    };

    const cpuTemp = calcStats((s) => s.cpuTemp);
    const gpuTemp = calcStats((s) => s.gpuTemp);
    const cpuLoad = calcStats((s) => s.cpuLoad);
    const gpuLoad = calcStats((s) => s.gpuLoad);
    const ram = calcStats((s) => s.ramUsedGB);

    // Identifica o gargalo dominante
    let dominantBottleneck = 'BALANCED';
    let maxFreq = 0;
    for (const [key, freq] of Object.entries(this.activeSession.bottleneckFrequency || {})) {
      if (freq > maxFreq) {
        maxFreq = freq;
        dominantBottleneck = key;
      }
    }

    return {
      sessionId: this.activeSession.id,
      timestamp: endTime,
      startTime,
      endTime,
      durationSeconds,
      durationFormatted: this.formatDuration(durationSeconds),
      cpu: {
        peakTemp: cpuTemp.peak,
        avgTemp: cpuTemp.avg,
        peakLoad: cpuLoad.peak,
        avgLoad: cpuLoad.avg,
      },
      gpu: {
        peakTemp: gpuTemp.peak,
        avgTemp: gpuTemp.avg,
        peakLoad: gpuLoad.peak,
        avgLoad: gpuLoad.avg,
      },
      ram: {
        peakUsedGB: ram.peak,
        avgUsedGB: ram.avg,
      },
      throttlingEventsCount: this.activeSession.throttlingCount,
      bottleneckDominant: dominantBottleneck,
      samplesAnalyzed: samples.length,
    };
  }

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  getStatus() {
    return {
      state: this.state,
      isSessionActive: this.state !== 'IDLE',
      ringStats: this.ringBuffer.getStats(),
      lastReport: this.lastReport,
    };
  }
}

module.exports = { RingBuffer, SessionBenchmark };
