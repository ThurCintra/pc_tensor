const fs = require('fs');
const { spawn } = require('child_process');
const { sensorBridgeCandidates } = require('../paths');

const RESTART_DELAY_MS = 6000;
const STALE_AFTER_MS = 4500;

/**
 * SensorBridge
 * Mantém o pc-sensor-bridge.exe (C# + LibreHardwareMonitorLib) rodando em modo --stream e guarda a
 * última leitura válida. Cada linha do stdout é um JSON completo com CPU, GPU, placa-mãe, disco e I/O.
 */
class SensorBridge {
  constructor({ candidates = sensorBridgeCandidates(), spawnFn = spawn, now = () => Date.now() } = {}) {
    this.candidates = candidates;
    this.spawnFn = spawnFn;
    this.now = now;
    this.process = null;
    this.latest = null;
    this.lastUpdate = 0;
    this.stopped = false;
    this.restartTimer = null;
  }

  start() {
    if (this.process || this.stopped) return;

    const exe = this.candidates.find((p) => fs.existsSync(p));
    if (!exe) return;

    try {
      this.process = this.spawnFn(exe, ['--stream'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      this.process = null;
      return;
    }

    let buffer = '';
    this.process.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // mantém a linha incompleta para o próximo pedaço
      for (const line of lines) this.ingestLine(line);
    });

    this.process.on('error', () => {
      this.process = null;
    });

    this.process.on('exit', () => {
      this.process = null;
      if (!this.stopped) {
        this.restartTimer = setTimeout(() => this.start(), RESTART_DELAY_MS);
      }
    });
  }

  ingestLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return;
    try {
      const data = JSON.parse(trimmed);
      if (data && data.success) {
        this.latest = data;
        this.lastUpdate = this.now();
      }
    } catch {
      // linha corrompida: ignora e espera a próxima
    }
  }

  /** Última leitura, ou null se a ponte parou de responder há mais de STALE_AFTER_MS. */
  getFreshData() {
    if (!this.latest || this.now() - this.lastUpdate >= STALE_AFTER_MS) return null;
    return this.latest;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // processo já encerrado
      }
      this.process = null;
    }
  }
}

module.exports = { SensorBridge, STALE_AFTER_MS };
