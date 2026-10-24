const electron = require('electron');
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, nativeTheme } = typeof electron === 'object' && electron ? electron : {};
const path = require('path');
const http = require('http');
const fs = require('fs');
const { execFile } = require('child_process');
const { SystemCollector } = require('./collector');
const { MobileLiveServer } = require('../server/mobile-server');
const { SettingsStore } = require('./settings-store');
const { ThermalAlertMonitor } = require('./thermal-alerts');

// Fixa a pasta de dados para que dev (`electron .`) e o app instalado usem %APPDATA%\pc-sentinel
if (app?.setPath && app?.getPath) {
  app.setPath('userData', path.join(app.getPath('appData'), 'pc-sentinel'));
}

// Otimizações de processo: desativa processos sobressalentes do Chromium
if (app?.commandLine) {
  app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

let mainWindow = null;
let qrWindow = null;
let collector = null;
let mobileServer = null;
let metricsInterval = null;
let isCollecting = false;
let tray = null;
let isQuitting = false;
let settingsStore = null;
let alertMonitor = null;
let isElevated = false;
let loadedFromViteDev = false;

/**
 * `net session` só funciona em um processo com privilégio de Administrador.
 */
function detectElevation() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    execFile('net', ['session'], { windowsHide: true }, (error) => resolve(!error));
  });
}

// Cores de fundo da janela iguais às do tema do Windows (evita flash branco/preto ao abrir)
function windowBackground() {
  return nativeTheme?.shouldUseDarkColors ? '#202020' : '#f3f3f3';
}

function isServerReachable(url) {
  return new Promise((resolve) => {
    const req = http.get(url, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

let isMiniWidget = false;
let normalBounds = { width: 1180, height: 780 };

/**
 * Hibernação do Renderer (Zero-Overhead):
 * Destrói completamente a instância pesada do BrowserWindow (React/Chromium)
 * ao minimizar ou fechar para a bandeja do sistema, zerando o uso de GPU e liberando
 * 150MB a 350MB de memória RAM, enquanto o coletor e o WebSocket continuam ativos em background.
 */
function hibernateRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const bounds = mainWindow.getBounds();
      if (!isMiniWidget) {
        normalBounds = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y };
      }
      mainWindow.destroy();
      mainWindow = null;
      console.log('[PC Sentinel] Interface desktop hibernada para a bandeja (Zero-Overhead de RAM e GPU).');
    } catch {
      mainWindow = null;
    }
  }
}

/**
 * Restaura ou recria a janela principal instantaneamente
 */
async function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    await createWindow();
  }
}

/**
 * Exibe janela compacta dedicada de Pareamento QR Code Mobile
 */
async function showQrWindow() {
  if (qrWindow && !qrWindow.isDestroyed()) {
    qrWindow.focus();
    return;
  }

  const serverInfo = mobileServer ? await mobileServer.getServerInfo() : { url: 'http://127.0.0.1:3890', qrCodeDataUrl: '' };

  qrWindow = new BrowserWindow({
    width: 360,
    height: 470,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: windowBackground(),
    title: 'PC Sentinel - Conectar celular',
    autoHideMenuBar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const escapeHtml = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>PC Sentinel - Conectar celular</title>
        <style>
          :root { color-scheme: light dark; --bg: #f3f3f3; --card: #ffffff; --text: #1a1a1a; --muted: #5f5f5f; --border: rgba(0,0,0,0.08); --accent: #005fb8; }
          @media (prefers-color-scheme: dark) { :root { --bg: #202020; --card: #2b2b2b; --text: #ffffff; --muted: #c5c5c5; --border: rgba(255,255,255,0.08); --accent: #60cdff; } }
          body { margin: 0; padding: 24px; background: var(--bg); color: var(--text); font: 14px 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif; text-align: center; }
          h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
          p { margin: 0 0 18px; color: var(--muted); }
          .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: inline-block; }
          img { width: 220px; height: 220px; display: block; image-rendering: pixelated; }
          .url { margin-top: 14px; font: 12px Consolas, monospace; color: var(--accent); word-break: break-all; }
        </style>
      </head>
      <body>
        <h1>Conectar celular</h1>
        <p>Aponte a câmera do celular para o código</p>
        <div class="card"><img src="${serverInfo.qrCodeDataUrl}" alt="QR Code de pareamento" /></div>
        <div class="url">${escapeHtml(serverInfo.url)}</div>
      </body>
    </html>
  `;

  qrWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  qrWindow.on('closed', () => { qrWindow = null; });
}

async function createWindow() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const hasIcon = fs.existsSync(iconPath);

  mainWindow = new BrowserWindow({
    width: normalBounds.width || 1180,
    height: normalBounds.height || 780,
    x: normalBounds.x,
    y: normalBounds.y,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: windowBackground(),
    title: 'PC Sentinel',
    icon: hasIcon ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  const distPath = path.join(__dirname, '../../dist/index.html');
  const devUrl = 'http://localhost:5173';

  // Em desenvolvimento (`npm run dev`) usa o Vite com hot reload; fora dele, o build em dist/
  loadedFromViteDev = !app.isPackaged && (await isServerReachable(devUrl));
  if (loadedFromViteDev) {
    await mainWindow.loadURL(devUrl);
  } else if (fs.existsSync(distPath)) {
    await mainWindow.loadFile(distPath);
  } else {
    console.error('[PC Sentinel] dist/index.html não encontrado. Rode "npm run build".');
  }

  // Fechar a janela mantém o app na bandeja e libera o renderer (coleta e servidor seguem ativos)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hibernateRenderer();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildTrayMenuTemplate(options = {}) {
  const { onOpenDashboard, onBoost, onShowQr, onQuit, serverPort, onToggleAutoLaunch, openAtLogin } = options;

  const autoLaunchItems = onToggleAutoLaunch
    ? [{
        label: 'Iniciar com o Windows',
        type: 'checkbox',
        checked: Boolean(openAtLogin),
        click: (item) => onToggleAutoLaunch(item ? item.checked : !openAtLogin),
      }]
    : [];

  return [
    {
      label: 'Abrir Dashboard',
      click: () => onOpenDashboard && onOpenDashboard(),
    },
    {
      label: 'Modo Boost (Liberar RAM)',
      click: () => onBoost && onBoost(),
    },
    {
      label: 'Exibir QR Code Mobile',
      click: () => onShowQr && onShowQr(),
    },
    { type: 'separator' },
    {
      label: `Servidor Mobile: Ativo (Porta ${serverPort || 3890})`,
      enabled: false,
    },
    ...autoLaunchItems,
    { type: 'separator' },
    {
      label: 'Sair do PC Sentinel',
      click: () => onQuit && onQuit(),
    },
  ];
}

/**
 * Ativa a inicialização com o Windows apenas na primeira execução do app instalado.
 * Depois disso a escolha fica com o usuário (menu da bandeja) e nunca é sobrescrita.
 */
function configureAutoLaunchOnFirstRun() {
  if (!app.isPackaged) return;
  const markerPath = path.join(app.getPath('userData'), 'autolaunch-configured');
  if (fs.existsSync(markerPath)) return;
  try {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: [] });
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
  } catch (e) {
    console.error('[PC Sentinel] Erro ao configurar loginItemSettings:', e);
  }
}

/**
 * Caminho persistente do histórico térmico em %APPDATA%: o diretório de trabalho
 * do app instalado (System32 / Program Files) não é gravável.
 */
function resolveThermalDbPath() {
  const userDataDir = app.getPath('userData');
  fs.mkdirSync(userDataDir, { recursive: true });
  const target = path.join(userDataDir, 'thermal_history.db');

  // Migra o histórico gravado por versões anteriores no diretório de trabalho
  const legacyJson = path.join(process.cwd(), 'thermal_history.json');
  const targetJson = target.replace(/\.db$/i, '.json');
  try {
    if (!fs.existsSync(targetJson) && fs.existsSync(legacyJson)) {
      fs.copyFileSync(legacyJson, targetJson);
    }
  } catch {}

  return target;
}

/**
 * Reabre o PC Sentinel com privilégio de Administrador (prompt do UAC) para liberar os sensores.
 * Solta a trava de instância única e a porta do servidor antes, para a nova instância assumir;
 * se o usuário recusar o UAC, restaura tudo e segue rodando sem elevação.
 */
async function relaunchAsAdmin() {
  if (isElevated) return { success: false, error: 'ALREADY_ELEVATED' };

  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const args = process.argv.slice(1).filter(Boolean);
  const argList = args.length > 0 ? ` -ArgumentList ${args.map(quote).join(',')}` : '';
  const command = `Start-Process -FilePath ${quote(process.execPath)}${argList} -WorkingDirectory ${quote(process.cwd())} -Verb RunAs`;

  app.releaseSingleInstanceLock();
  await mobileServer.stop();

  const launched = await new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (error) => resolve(!error));
  });

  if (!launched) {
    app.requestSingleInstanceLock();
    await mobileServer.start();
    return { success: false, error: 'UAC_DECLINED', message: 'A elevação foi cancelada.' };
  }

  isQuitting = true;
  if (metricsInterval) clearInterval(metricsInterval);
  if (collector) collector.stop();
  setTimeout(() => app.quit(), 200);
  return { success: true };
}

function getAutoLaunchState() {
  return {
    supported: Boolean(app.isPackaged),
    enabled: app.isPackaged ? app.getLoginItemSettings().openAtLogin : false,
  };
}

function setAutoLaunch(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath, args: [] });
  refreshTrayMenu();
}

function showThermalNotification(alert) {
  if (!Notification || !Notification.isSupported()) return;
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  new Notification({
    title: `PC Sentinel - ${alert.label} acima de ${alert.limit} °C`,
    body: `${alert.label} atingiu ${alert.temp.toFixed(1)} °C. Verifique a refrigeração ou reduza a carga.`,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    urgency: 'critical',
  }).show();
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip(`PC Sentinel - Hardware & Thermal Telemetry (Porta ${mobileServer?.port || 3890})`);
  refreshTrayMenu();

  tray.on('double-click', () => showMainWindow());
  tray.on('click', () => showMainWindow());
}

function refreshTrayMenu() {
  if (!tray) return;
  const iconPath = path.join(__dirname, '../../assets/icon.png');

  const template = buildTrayMenuTemplate({
    serverPort: mobileServer?.port || 3890,
    openAtLogin: app.isPackaged ? app.getLoginItemSettings().openAtLogin : false,
    onToggleAutoLaunch: app.isPackaged ? (enabled) => setAutoLaunch(enabled) : null,
    onOpenDashboard: () => showMainWindow(),
    onBoost: async () => {
      if (mobileServer?.actionRouter) {
        const res = await mobileServer.actionRouter.boostCleanup();
        if (Notification.isSupported()) {
          new Notification({
            title: 'PC Sentinel - Modo Boost',
            body: res.message,
            icon: fs.existsSync(iconPath) ? iconPath : undefined,
          }).show();
        }
      }
    },
    onShowQr: () => showQrWindow(),
    onQuit: () => {
      isQuitting = true;
      if (metricsInterval) clearInterval(metricsInterval);
      if (collector) collector.stop();
      if (mobileServer) mobileServer.stop();
      if (qrWindow && !qrWindow.isDestroyed()) qrWindow.destroy();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      app.quit();
    },
  });

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function setupIpc() {
  ipcMain.handle('metrics:snapshot', async () => {
    return await collector.getMetricsSnapshot();
  });

  ipcMain.handle('mobile-server:get-info', async () => {
    return await mobileServer.getServerInfo();
  });

  ipcMain.handle('mobile-server:toggle', async (event, shouldStart) => {
    if (shouldStart) {
      return await mobileServer.start();
    } else {
      await mobileServer.stop();
      return await mobileServer.getServerInfo();
    }
  });

  ipcMain.handle('hardware:info', async (event, forceRefresh) => {
    return await collector.getHardwareInfo(forceRefresh);
  });

  ipcMain.handle('window:toggle-mini-widget', async (event, toMini) => {
    if (!mainWindow) return false;
    isMiniWidget = typeof toMini === 'boolean' ? toMini : !isMiniWidget;

    if (isMiniWidget) {
      const bounds = mainWindow.getBounds();
      normalBounds = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y };

      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.setMinimumSize(300, 84);
      mainWindow.setSize(340, 84);
      try {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width } = primaryDisplay.workAreaSize;
        mainWindow.setPosition(width - 350, 40);
      } catch (e) {}
    } else {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setMinimumSize(760, 540);
      mainWindow.setSize(normalBounds.width || 1180, normalBounds.height || 780);
      if (normalBounds.x && normalBounds.y) {
        mainWindow.setPosition(normalBounds.x, normalBounds.y);
      } else {
        mainWindow.center();
      }
    }

    return isMiniWidget;
  });

  ipcMain.handle('settings:get', async () => ({
    ...settingsStore.get(),
    autoLaunch: getAutoLaunchState(),
  }));

  ipcMain.handle('settings:update', async (event, partial = {}) => {
    const previousPort = settingsStore.get().mobilePort;
    const next = settingsStore.update(partial);
    mobileServer.actionRouter.setBoostTargets(next.boostTargets);

    if (typeof partial.autoLaunch === 'boolean') {
      setAutoLaunch(partial.autoLaunch);
    }
    if (next.mobilePort !== previousPort) {
      await mobileServer.changePort(next.mobilePort);
      refreshTrayMenu();
    }
    return { ...next, autoLaunch: getAutoLaunchState(), serverInfo: await mobileServer.getServerInfo() };
  });

  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    isElevated,
    // Em `npm run dev` o reinício mataria o Vite (concurrently -k); lá o terminal é que deve ser elevado
    canRelaunchElevated: !isElevated && !loadedFromViteDev && process.platform === 'win32',
  }));

  ipcMain.handle('app:relaunch-as-admin', async () => relaunchAsAdmin());

  // Revoga o pareamento: novo token persistido e todos os celulares desconectados
  ipcMain.handle('mobile-server:revoke-token', async () => {
    const token = settingsStore.rotateToken();
    return mobileServer.rotateToken(token);
  });

  // FASE 4: Execução de ações de controle (Stream Deck) disparadas pelo Desktop
  ipcMain.handle('action:execute', async (event, payload) => {
    if (mobileServer && mobileServer.actionRouter) {
      return await mobileServer.actionRouter.handleAction(payload);
    }
    return { success: false, error: 'ACTION_ROUTER_UNAVAILABLE', message: 'Roteador de ações indisponível.' };
  });
}

function startMetricsLoop() {
  const tickMetrics = async () => {
    if (isCollecting) return;
    isCollecting = true;
    try {
      const metrics = await collector.getMetricsSnapshot();
      if (alertMonitor) {
        metrics.alerts = alertMonitor.evaluate(metrics);
      }

      // Envia para o processo Desktop (React)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('metrics:update', metrics);
      }

      // Transmite ao vivo para os celulares conectados via WebSocket
      mobileServer.broadcastMetrics(metrics);
    } catch (err) {
      console.error('Erro no loop de métricas:', err);
    } finally {
      isCollecting = false;
    }
  };

  tickMetrics();
  metricsInterval = setInterval(tickMetrics, 1200);

  if (collector && typeof collector.on === 'function') {
    collector.on('SESSION_REPORT_READY', (report) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('session:report', report);
      }
    });
  }
}

// Bloqueio de Instância Única: se o usuário clicar no atalho com o app já rodando,
// foca a janela existente em vez de abrir um segundo processo conflitante.
if (app) {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.log('[PC Sentinel] Uma instância já está em execução. Encerrando processo duplicado.');
    app.quit();
  } else {
    app.on('second-instance', () => {
      showMainWindow();
    });

    app.on('before-quit', () => {
      isQuitting = true;
    });

    app.whenReady().then(async () => {
      configureAutoLaunchOnFirstRun();
      isElevated = await detectElevation();

      settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
      const settings = settingsStore.get();

      collector = new SystemCollector(null, { thermalDbPath: resolveThermalDbPath() });
      mobileServer = new MobileLiveServer({
        port: settings.mobilePort,
        collector,
        sessionToken: settingsStore.sessionToken,
      });
      mobileServer.actionRouter.setBoostTargets(settings.boostTargets);

      alertMonitor = new ThermalAlertMonitor({
        getSettings: () => settingsStore.get(),
        notify: showThermalNotification,
      });

      // Inicia automaticamente o servidor mobile local (porta 3890 com fallback dinâmico)
      try {
        await mobileServer.start();
        console.log(`[PC Sentinel] Servidor Mobile WebSocket ativo na porta ${mobileServer.port}`);
      } catch (err) {
        console.warn('[PC Sentinel] Aviso ao iniciar servidor mobile:', err.message);
      }

      setupIpc();
      createTray();
      await createWindow();
      startMetricsLoop();
      console.log('[PC Sentinel] Coletor de Telemetria e Interface inicializados com sucesso.');

      app.on('activate', () => {
        showMainWindow();
      });
    });

    app.on('window-all-closed', async () => {
      // Não fecha se estiver em segundo plano (System Tray)
      if (isQuitting) {
        if (metricsInterval) clearInterval(metricsInterval);
        if (collector) collector.stop();
        if (mobileServer) await mobileServer.stop();
        if (process.platform !== 'darwin') app.quit();
      }
    });
  }
}

module.exports = {
  buildTrayMenuTemplate,
  hibernateRenderer,
  showMainWindow,
  showQrWindow,
};
