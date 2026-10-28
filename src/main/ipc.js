const { app, ipcMain, shell } = require('electron');
const { releaseNotesUrl } = require('./updater');

const SENSOR_DRIVER_URL = 'https://pawnio.eu';

/**
 * Canais IPC expostos ao renderer pelo preload (src/preload/index.js).
 * Cada handler só delega para os serviços do contexto; a regra de negócio fica neles.
 */
function registerIpcHandlers(ctx, actions) {
  const { collector, mobileServer, settingsStore, windows, autoLaunch } = ctx;

  const settingsWithAutoLaunch = (settings) => ({ ...settings, autoLaunch: autoLaunch.getState() });

  ipcMain.handle('metrics:snapshot', () => collector.getMetricsSnapshot());
  ipcMain.handle('hardware:info', (_event, forceRefresh) => collector.getHardwareInfo(forceRefresh));

  ipcMain.handle('mobile-server:get-info', () => mobileServer.getServerInfo());
  ipcMain.handle('mobile-server:toggle', async (_event, shouldStart) => {
    if (shouldStart) return mobileServer.start();
    await mobileServer.stop();
    return mobileServer.getServerInfo();
  });
  // Revoga o pareamento: novo token persistido e todos os celulares desconectados
  ipcMain.handle('mobile-server:revoke-token', () => mobileServer.rotateToken(settingsStore.rotateToken()));

  ipcMain.handle('window:toggle-mini-widget', (_event, toMini) => windows.toggleMiniWidget(toMini));

  ipcMain.handle('settings:get', () => settingsWithAutoLaunch(settingsStore.get()));
  ipcMain.handle('settings:update', async (_event, partial = {}) => {
    const previousPort = settingsStore.get().mobilePort;
    const next = settingsStore.update(partial);
    mobileServer.actionRouter.setBoostTargets(next.boostTargets);

    if (typeof partial.autoLaunch === 'boolean') actions.setAutoLaunch(partial.autoLaunch);
    if (next.mobilePort !== previousPort) {
      await mobileServer.changePort(next.mobilePort);
      actions.refreshTray();
    }
    return { ...settingsWithAutoLaunch(next), serverInfo: await mobileServer.getServerInfo() };
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    isElevated: ctx.isElevated,
    // Em `npm run dev` o reinício mataria o Vite (concurrently -k); lá o terminal é que deve ser elevado
    canRelaunchElevated: !ctx.isElevated && !windows.loadedFromViteDev && process.platform === 'win32',
  }));
  ipcMain.handle('app:relaunch-as-admin', () => actions.relaunchAsAdmin());
  // Página oficial do driver PawnIO (endereço fixo aqui; a tela só pede para abrir)
  ipcMain.handle('app:open-sensor-driver-page', () => shell.openExternal(SENSOR_DRIVER_URL));

  // Endereço do serviço nativo para a camada de tempo real (src/renderer/realtime)
  ipcMain.handle('service:endpoint', () =>
    ctx.service?.available ? { url: `ws://127.0.0.1:${ctx.service.port}/ws`, token: settingsStore.sessionToken } : null,
  );

  ipcMain.handle('updates:get-state', () => ctx.updates.getState());
  ipcMain.handle('updates:check', () => ctx.updates.check());
  ipcMain.handle('updates:install', () => actions.installUpdate());
  // Novidades da versão no GitHub (o endereço é montado aqui; da tela só vem o número da versão)
  ipcMain.handle('updates:open-notes', (_event, version) => shell.openExternal(releaseNotesUrl(version)));

  ipcMain.handle('action:execute', (_event, payload) => mobileServer.actionRouter.handleAction(payload));
}

module.exports = { registerIpcHandlers };
