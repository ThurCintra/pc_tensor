const EventEmitter = require('events');

const STARTUP_DELAY_MS = 8000;
const BUSY = new Set(['checking', 'downloading', 'downloaded']);

/**
 * UpdateService
 * Procura atualizações nas releases do GitHub sempre que o app abre (electron-updater).
 * A nova versão é baixada em segundo plano e instalada ao reiniciar o app, pelo botão
 * "Reiniciar e atualizar" ou na próxima vez que ele for fechado.
 *
 * Estados: unsupported (rodando fora do app instalado), idle, checking, downloading,
 * downloaded, up-to-date e error. Cada mudança emite 'state' com uma cópia do estado.
 */
class UpdateService extends EventEmitter {
  constructor({ updater, supported, currentVersion, notify = () => {}, startupDelayMs = STARTUP_DELAY_MS }) {
    super();
    this.updater = updater;
    this.supported = Boolean(supported);
    this.notify = notify;
    this.startupDelayMs = startupDelayMs;
    this.startupTimer = null;
    this.state = {
      status: this.supported ? 'idle' : 'unsupported',
      currentVersion,
      availableVersion: null,
      percent: null,
      error: null,
      checkedAt: null,
    };
  }

  getState() {
    return { ...this.state };
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', this.getState());
  }

  /** Liga os eventos do electron-updater e agenda a verificação de quando o app abre. */
  start() {
    if (!this.supported) return;

    this.updater.autoDownload = true;
    this.updater.autoInstallOnAppQuit = true;
    this.updater.logger = null;

    this.updater.on('checking-for-update', () => this.setState({ status: 'checking', error: null }));
    this.updater.on('update-available', (info) =>
      this.setState({ status: 'downloading', availableVersion: info?.version || null, percent: 0 }),
    );
    this.updater.on('update-not-available', () =>
      this.setState({ status: 'up-to-date', availableVersion: null, checkedAt: Date.now() }),
    );
    this.updater.on('download-progress', (progress) =>
      this.setState({ status: 'downloading', percent: Math.round(progress?.percent || 0) }),
    );
    this.updater.on('update-downloaded', (info) => {
      const version = info?.version || this.state.availableVersion;
      this.setState({ status: 'downloaded', availableVersion: version, percent: 100, checkedAt: Date.now() });
      this.notify({
        title: `PC Sentinel ${version} pronto para instalar`,
        body: 'A atualização foi baixada e será instalada ao reiniciar o app.',
      });
    });
    this.updater.on('error', (err) =>
      this.setState({ status: 'error', error: describeError(err), percent: null, checkedAt: Date.now() }),
    );

    this.startupTimer = setTimeout(() => this.check(), this.startupDelayMs);
  }

  async check() {
    if (!this.supported || BUSY.has(this.state.status)) return this.getState();
    this.setState({ status: 'checking', error: null });
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      this.setState({ status: 'error', error: describeError(err), checkedAt: Date.now() });
    }
    return this.getState();
  }

  /** Fecha o app e roda o instalador já baixado em modo silencioso, reabrindo em seguida. */
  install() {
    if (this.state.status !== 'downloaded') return false;
    this.updater.quitAndInstall(true, true);
    return true;
  }

  stop() {
    clearTimeout(this.startupTimer);
  }
}

/** Mensagem curta em português para os erros mais comuns do electron-updater. */
function describeError(err) {
  const message = String(err?.message || err || '');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::ERR_/i.test(message)) {
    return 'Sem conexão com o GitHub. Tente de novo mais tarde.';
  }
  if (/latest\.yml/i.test(message) || /\b404\b/.test(message)) {
    return 'A última versão publicada ainda não tem suporte a atualização automática.';
  }
  return 'Não foi possível verificar atualizações.';
}

module.exports = { UpdateService, describeError };
