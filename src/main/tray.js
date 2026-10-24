const { DEFAULT_PORT } = require('../server/mobile-server');

/**
 * Itens do menu da bandeja. Função pura (sem Electron) para poder ser testada.
 */
function buildTrayMenuTemplate(options = {}) {
  const { onOpenDashboard, onBoost, onShowQr, onQuit, serverPort, onToggleAutoLaunch, openAtLogin } = options;

  const autoLaunchItems = onToggleAutoLaunch
    ? [
        {
          label: 'Iniciar com o Windows',
          type: 'checkbox',
          checked: Boolean(openAtLogin),
          click: (item) => onToggleAutoLaunch(item ? item.checked : !openAtLogin),
        },
      ]
    : [];

  return [
    { label: 'Abrir Dashboard', click: () => onOpenDashboard?.() },
    { label: 'Modo Boost (Liberar RAM)', click: () => onBoost?.() },
    { label: 'Exibir QR Code Mobile', click: () => onShowQr?.() },
    { type: 'separator' },
    { label: `Servidor Mobile: Ativo (Porta ${serverPort || DEFAULT_PORT})`, enabled: false },
    ...autoLaunchItems,
    { type: 'separator' },
    { label: 'Sair do PC Sentinel', click: () => onQuit?.() },
  ];
}

/** Ícone da bandeja ligado ao contexto do app (janelas, servidor, auto-início). */
class TrayController {
  constructor(ctx, actions) {
    this.ctx = ctx;
    this.actions = actions;
    this.tray = null;
  }

  create() {
    if (this.tray) return;
    const { Tray, nativeImage } = require('electron');
    const fs = require('fs');
    const { paths } = require('./paths');

    const icon = fs.existsSync(paths.icon) ? nativeImage.createFromPath(paths.icon) : nativeImage.createEmpty();
    this.tray = new Tray(icon);
    this.tray.on('click', () => this.actions.showMain());
    this.tray.on('double-click', () => this.actions.showMain());
    this.refresh();
  }

  refresh() {
    if (!this.tray) return;
    const { Menu } = require('electron');
    const { autoLaunch, mobileServer } = this.ctx;
    const port = mobileServer?.port || DEFAULT_PORT;
    const autoLaunchState = autoLaunch.getState();

    this.tray.setToolTip(`PC Sentinel (porta ${port})`);
    this.tray.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenuTemplate({
          serverPort: port,
          openAtLogin: autoLaunchState.enabled,
          onToggleAutoLaunch: autoLaunchState.supported ? (enabled) => this.actions.setAutoLaunch(enabled) : null,
          onOpenDashboard: () => this.actions.showMain(),
          onBoost: () => this.actions.boost(),
          onShowQr: () => this.actions.showQr(),
          onQuit: () => this.actions.quit(),
        }),
      ),
    );
  }
}

module.exports = { buildTrayMenuTemplate, TrayController };
