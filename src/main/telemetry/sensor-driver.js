const { execFile } = require('child_process');

const PAWNIO_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PawnIO';
const RECHECK_MS = 60_000;

/**
 * Driver PawnIO: o LibreHardwareMonitor lê temperatura, clock e potência da CPU por ele. Sem o driver essas
 * leituras vêm vazias (só carga e discos funcionam), então a Visão geral explica a causa em vez de "Sem sensor".
 * A detecção é a mesma do LibreHardwareMonitor: a entrada de desinstalação do PawnIO no registro de 64 bits.
 *
 * `installed` é true, false ou null (fora do Windows ou ainda não verificado). Enquanto falta o driver, confere
 * de novo a cada minuto para o aviso sumir depois que o usuário instala.
 */
class SensorDriverProbe {
  constructor({ execFileFn = execFile, platform = process.platform, recheckMs = RECHECK_MS } = {}) {
    this.execFileFn = execFileFn;
    this.platform = platform;
    this.recheckMs = recheckMs;
    this.installed = null;
    this.lastCheck = 0;
    this.pending = null;
  }

  /** Atualiza o estado se estiver na hora; nunca atrasa o ciclo de métricas (a consulta roda em segundo plano). */
  refresh(now = Date.now()) {
    if (this.platform !== 'win32' || this.pending || this.installed === true) return;
    if (this.lastCheck && now - this.lastCheck < this.recheckMs) return;
    this.lastCheck = now;
    this.pending = new Promise((resolve) => {
      this.execFileFn(
        'reg',
        ['query', PAWNIO_KEY, '/v', 'DisplayVersion', '/reg:64'],
        { windowsHide: true },
        (error) => {
          this.installed = !error;
          this.pending = null;
          resolve(this.installed);
        },
      );
    });
  }
}

module.exports = { SensorDriverProbe, PAWNIO_KEY };
