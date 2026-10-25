import { describe, it, expect, vi, afterEach } from 'vitest';
const EventEmitter = require('events');
const { UpdateService, describeError, releaseNotesUrl } = require('../../src/main/updater');

function createUpdater() {
  const updater = new EventEmitter();
  updater.checkForUpdates = vi.fn().mockResolvedValue(null);
  updater.quitAndInstall = vi.fn();
  return updater;
}

function createService(overrides = {}) {
  const updater = createUpdater();
  const notify = vi.fn();
  const service = new UpdateService({ updater, supported: true, currentVersion: '0.2.0', notify, ...overrides });
  const states = [];
  service.on('state', (s) => states.push(s.status));
  return { service, updater, notify, states };
}

describe('UpdateService', () => {
  afterEach(() => vi.useRealTimers());

  it('procura atualizações sozinho alguns segundos depois de abrir', async () => {
    vi.useFakeTimers();
    const { service, updater } = createService({ startupDelayMs: 5000 });

    service.start();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it('acompanha a busca, o download e avisa quando a versão está pronta', () => {
    const { service, updater, notify, states } = createService();
    service.start();

    updater.emit('checking-for-update');
    updater.emit('update-available', { version: '0.3.0' });
    updater.emit('download-progress', { percent: 42.4 });
    expect(service.getState()).toMatchObject({ status: 'downloading', availableVersion: '0.3.0', percent: 42 });

    updater.emit('update-downloaded', { version: '0.3.0' });
    expect(service.getState()).toMatchObject({ status: 'downloaded', availableVersion: '0.3.0', percent: 100 });
    expect(states).toEqual(['checking', 'downloading', 'downloading', 'downloaded']);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'PC Sentinel 0.3.0 pronto para instalar' }));
  });

  it('informa quando já está na versão mais recente', () => {
    const { service, updater } = createService();
    service.start();

    updater.emit('update-not-available', { version: '0.2.0' });

    expect(service.getState()).toMatchObject({ status: 'up-to-date', availableVersion: null });
    expect(service.getState().checkedAt).toBeTypeOf('number');
  });

  it('não começa outra busca enquanto uma está em andamento ou já baixada', async () => {
    const { service, updater } = createService();
    service.start();

    await service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

    updater.emit('checking-for-update');
    await service.check();
    updater.emit('update-downloaded', { version: '0.3.0' });
    await service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('transforma falhas em mensagens curtas', async () => {
    const { service, updater } = createService();
    updater.checkForUpdates.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.github.com'));
    service.start();

    const state = await service.check();

    expect(state).toMatchObject({ status: 'error', error: 'Sem conexão com o GitHub. Tente de novo mais tarde.' });
  });

  it('só instala quando a atualização terminou de baixar', () => {
    const { service, updater } = createService();
    service.start();

    expect(service.install()).toBe(false);
    updater.emit('update-downloaded', { version: '0.3.0' });
    expect(service.install()).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('com a opção desligada não procura ao abrir, só pelo botão', async () => {
    vi.useFakeTimers();
    const { service, updater } = createService({ startupDelayMs: 5000, checkOnStartup: () => false });

    service.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();

    await service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('não faz nada fora do app instalado', async () => {
    const { service, updater } = createService({ supported: false });

    service.start();
    const state = await service.check();

    expect(state.status).toBe('unsupported');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });
});

describe('describeError', () => {
  it('reconhece release sem latest.yml', () => {
    expect(describeError(new Error('Cannot find latest.yml in the latest release artifacts'))).toBe(
      'A última versão publicada ainda não tem suporte a atualização automática.',
    );
    expect(describeError(new Error('algo inesperado'))).toBe('Não foi possível verificar atualizações.');
  });
});

describe('releaseNotesUrl', () => {
  it('abre a release da versão e recusa qualquer outra coisa', () => {
    expect(releaseNotesUrl('1.2.1')).toBe('https://github.com/ThurCintra/pc_tensor/releases/tag/v1.2.1');
    expect(releaseNotesUrl('https://exemplo.com')).toBe('https://github.com/ThurCintra/pc_tensor/releases');
    expect(releaseNotesUrl('1.2.1/../../x')).toBe('https://github.com/ThurCintra/pc_tensor/releases');
    expect(releaseNotesUrl(null)).toBe('https://github.com/ThurCintra/pc_tensor/releases');
  });
});
