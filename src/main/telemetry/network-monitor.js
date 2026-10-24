const net = require('net');
const { execFile } = require('child_process');

/**
 * NetworkMonitor
 * Monitor assíncrono não-bloqueante de latência, jitter e perda de pacotes.
 * Projetado para Zero-Overhead usando TCP Socket probing com fallback para ping nativo.
 */
class NetworkMonitor {
  constructor(options = {}) {
    this.targetHost = options.host || '1.1.1.1';
    this.targetPort = options.port || 443;
    this.intervalMs = options.intervalMs || 5000;
    this.timeoutMs = options.timeoutMs || 2000;

    this.history = [];
    this.maxHistory = 10;
    this.consecutivePings = [];
    this.totalProbes = 0;
    this.failedProbes = 0;

    this.currentMetrics = {
      latencyMs: null,
      jitterMs: null,
      packetLossPercent: 0,
      status: 'MEASURING', // 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DISCONNECTED'
      target: this.targetHost,
      updatedAt: 0,
    };

    this.timer = null;
    this.isMeasuring = false;
  }

  start() {
    if (this.timer) return;
    this.measure();
    this.timer = setInterval(() => this.measure(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async measure() {
    if (this.isMeasuring) return this.currentMetrics;
    this.isMeasuring = true;

    try {
      const probeResult = await this.probeSocket(this.targetHost, this.targetPort, this.timeoutMs);
      this.recordProbe(probeResult);
    } catch {
      // Fallback para ping CLI nativo se o socket falhar
      try {
        const cliResult = await this.probeCli(this.targetHost);
        this.recordProbe(cliResult);
      } catch {
        this.recordProbe({ success: false, latency: null });
      }
    } finally {
      this.isMeasuring = false;
    }

    return this.currentMetrics;
  }

  probeSocket(host, port, timeout) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const socket = new net.Socket();

      let resolved = false;

      socket.setTimeout(timeout);

      socket.connect(port, host, () => {
        if (!resolved) {
          resolved = true;
          const latency = Date.now() - startTime;
          socket.destroy();
          resolve({ success: true, latency });
        }
      });

      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({ success: false, latency: null });
        }
      });

      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          reject(err);
        }
      });
    });
  }

  probeCli(host) {
    return new Promise((resolve) => {
      const args = process.platform === 'win32' ? ['-n', '1', '-w', '1500', host] : ['-c', '1', '-W', '2', host];

      execFile('ping', args, { windowsHide: true }, (err, stdout) => {
        if (err || !stdout) {
          return resolve({ success: false, latency: null });
        }

        const out = stdout.toString();
        // Regex universal para tempo em ms (ex: tempo=14ms ou time=14ms ou tempo<1ms)
        const matchTime = out.match(/(?:tempo|time)[=<](\d+(?:\.\d+)?)ms/i) || out.match(/=(\d+)ms/i);
        if (matchTime && matchTime[1]) {
          const lat = parseFloat(matchTime[1]);
          return resolve({ success: true, latency: lat });
        }

        // Verifica perda no texto
        if (out.includes('100%') || out.includes('Esgotado') || out.includes('timed out')) {
          return resolve({ success: false, latency: null });
        }

        resolve({ success: false, latency: null });
      });
    });
  }

  recordProbe(result) {
    const now = Date.now();
    this.totalProbes++;

    if (!result.success || result.latency === null) {
      this.failedProbes++;
      this.consecutivePings.push(null);
    } else {
      this.history.push(result.latency);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.consecutivePings.push(result.latency);
    }

    if (this.consecutivePings.length > this.maxHistory) {
      this.consecutivePings.shift();
    }

    // Cálculo da perda de pacotes recente (últimas 10 amostras)
    const recentTotal = this.consecutivePings.length;
    const recentLost = this.consecutivePings.filter((p) => p === null).length;
    const lossPct = recentTotal > 0 ? Number(((recentLost / recentTotal) * 100).toFixed(1)) : 0;

    // Cálculo da latência média recente
    const validPings = this.consecutivePings.filter((p) => typeof p === 'number');
    let avgLatency = null;
    if (validPings.length > 0) {
      const sum = validPings.reduce((acc, v) => acc + v, 0);
      avgLatency = Number((sum / validPings.length).toFixed(1));
    }

    // Cálculo do Jitter RFC 1889 (variação absoluta média entre pings consecutivos)
    let jitter = null;
    if (validPings.length >= 2) {
      let diffSum = 0;
      let diffCount = 0;
      for (let i = 1; i < validPings.length; i++) {
        diffSum += Math.abs(validPings[i] - validPings[i - 1]);
        diffCount++;
      }
      jitter = diffCount > 0 ? Number((diffSum / diffCount).toFixed(1)) : 0;
    } else {
      jitter = 0;
    }

    // Status Semântico de Qualidade da Conexão
    let status = 'EXCELLENT';
    if (lossPct >= 15 || avgLatency === null) {
      status = 'DISCONNECTED';
    } else if (lossPct > 5 || avgLatency > 150 || (jitter && jitter > 30)) {
      status = 'POOR';
    } else if (avgLatency > 75 || (jitter && jitter > 15)) {
      status = 'FAIR';
    } else if (avgLatency > 35 || (jitter && jitter > 8)) {
      status = 'GOOD';
    } else {
      status = 'EXCELLENT';
    }

    this.currentMetrics = {
      latencyMs: avgLatency,
      jitterMs: jitter,
      packetLossPercent: lossPct,
      status,
      target: this.targetHost,
      updatedAt: now,
    };
  }

  getMetrics() {
    return this.currentMetrics;
  }
}

module.exports = { NetworkMonitor };
