const fs = require('fs');
const { spawn } = require('child_process');
const { sensorBridgeCandidates } = require('../paths');

const RESTART_DELAY_MS = 6000;
const STALE_AFTER_MS = 4500;

/**
 * SensorBridge
 * Mantém o pc-sensor-bridge.exe (C# + LibreHardwareMonitorLib) rodando em modo --stream e guarda a
 * última leitura válida. Cada linha do stdout é um JSON completo com CPU, GPU, placa-mãe, disco e I/O.
 *
 * Modos: 'full' lê os sensores pelo LibreHardwareMonitor; 'counters' (--no-hardware) só lê o I/O de disco pelos
 * contadores do Windows, para quando o serviço nativo já está lendo os sensores (ver HybridSensorSource).
 */
class SensorBridge {
  constructor({ candidates = sensorBridgeCandidates(), spawnFn = spawn, now = () => Date.now(), mode = 'full' } = {}) {
    this.candidates = candidates;
    this.mode = mode;
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
      this.process = this.spawnFn(exe, this.mode === 'counters' ? ['--stream', '--no-hardware'] : ['--stream'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      this.process = null;
      return;
    }

    // Os ouvintes conferem se o processo ainda é o atual: depois de uma troca de modo, uma linha atrasada ou a
    // saída do processo antigo não pode virar leitura nem disparar um reinício
    const child = this.process;
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      if (this.process !== child) return;
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // mantém a linha incompleta para o próximo pedaço
      for (const line of lines) this.ingestLine(line);
    });

    child.on('error', () => {
      if (this.process === child) this.process = null;
    });

    child.on('exit', () => {
      if (this.process !== child) return;
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

  /**
   * Troca o modo reiniciando o processo (o executável não muda de modo em execução). A leitura anterior é
   * descartada: uma leitura 'full' antiga não pode se passar por atual depois de trocar para 'counters'.
   */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.latest = null;
    this.lastUpdate = 0;
    if (this.stopped) return;
    clearTimeout(this.restartTimer);
    const old = this.process;
    this.process = null;
    if (old) {
      try {
        old.kill();
      } catch {
        // processo já encerrado
      }
    }
    this.start();
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
