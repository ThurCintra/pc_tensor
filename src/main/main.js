const electron = require('electron');
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = typeof electron === 'object' && electron ? electron : {};
const path = require('path');
const http = require('http');
const fs = require('fs');
const { SystemCollector } = require('./collector');
const { MobileLiveServer } = require('../server/mobile-server');

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
let normalBounds = { width: 1100, height: 750 };

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
    width: 380,
    height: 480,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#0B0F19',
    title: 'PC Sentinel - Pareamento Mobile',
    autoHideMenuBar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>PC Sentinel Mobile QR</title>
        <style>
          body {
            margin: 0; padding: 24px;
            background: #0B0F19; color: #E2E8F0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center;
          }
          h2 { margin: 0 0 8px; color: #00F0FF; font-size: 1.15rem; letter-spacing: 0.05em; text-transform: uppercase; }
          p { margin: 0 0 16px; font-size: 0.85rem; color: #94A3B8; }
          .qr-box {
            background: #111827; padding: 16px; border-radius: 12px;
            border: 1px solid #1E293B; box-shadow: 0 0 25px rgba(0, 240, 255, 0.15);
          }
          .qr-img { width: 220px; height: 220px; display: block; border-radius: 8px; }
          .url-box { margin-top: 16px; font-size: 0.78rem; color: #38BDF8; word-break: break-all; font-family: monospace; }
        </style>
      </head>
      <body>
        <h2>HUD Mobile - Conexão LAN</h2>
        <p>Aponte a câmera do celular para conectar em tempo real</p>
        <div class="qr-box">
          <img class="qr-img" src="${serverInfo.qrCodeDataUrl}" alt="QR Code" />
        </div>
        <div class="url-box">${serverInfo.url}</div>
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
    width: normalBounds.width || 1100,
    height: normalBounds.height || 750,
    x: normalBounds.x,
    y: normalBounds.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0B0F19',
    title: 'PC Sentinel - Hardware & Thermal Telemetry',
    icon: hasIcon ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  const devUrl = 'http://localhost:5173';
  let distPath = path.join(__dirname, '../../dist/index.html');
  if (!fs.existsSync(distPath)) {
    distPath = path.join(app.getAppPath(), 'dist/index.html');
  }
  let bootstrapPath = path.join(__dirname, '../server/public/index.html');
  if (!fs.existsSync(bootstrapPath)) {
    bootstrapPath = path.join(app.getAppPath(), 'src/server/public/index.html');
  }

  if (isDev) {
    const isViteUp = await isServerReachable(devUrl);
    if (isViteUp) {
      console.log('[PC Sentinel] Conectado ao servidor Vite Dev:', devUrl);
      await mainWindow.loadURL(devUrl);
    } else if (fs.existsSync(distPath)) {
      console.log('[PC Sentinel] Vite offline. Carregando dist compilado:', distPath);
      await mainWindow.loadFile(distPath);
    } else if (fs.existsSync(bootstrapPath)) {
      console.log('[PC Sentinel] Carregando interface bootstrap:', bootstrapPath);
      await mainWindow.loadFile(bootstrapPath);
    }
  } else {
    // MODO PRODUÇÃO: carrega estritamente o bundle compilado em dist/
    if (fs.existsSync(distPath)) {
      console.log('[PC Sentinel] MODO PRODUÇÃO: Carregando bundle estático:', distPath);
      await mainWindow.loadFile(distPath);
    } else if (fs.existsSync(bootstrapPath)) {
      console.log('[PC Sentinel] MODO PRODUÇÃO: dist não encontrado, carregando bootstrap:', bootstrapPath);
      await mainWindow.loadFile(bootstrapPath);
    } else {
      console.error('[PC Sentinel] ERRO CRÍTICO: dist/index.html não encontrado! Execute npm run build.');
    }
  }

  // FASE 3: Ao fechar ou minimizar, hiberna o Renderer para zerar overhead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hibernateRenderer();
      return false;
    }
  });

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    hibernateRenderer();
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
    onToggleAutoLaunch: app.isPackaged
      ? (enabled) => {
          app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [] });
          refreshTrayMenu();
        }
      : null,
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
      mainWindow.setMinimumSize(320, 68);
      mainWindow.setSize(330, 72);
      try {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width } = primaryDisplay.workAreaSize;
        mainWindow.setPosition(width - 350, 40);
      } catch (e) {}
    } else {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setMinimumSize(900, 600);
      mainWindow.setSize(normalBounds.width || 1100, normalBounds.height || 750);
      if (normalBounds.x && normalBounds.y) {
        mainWindow.setPosition(normalBounds.x, normalBounds.y);
      } else {
        mainWindow.center();
      }
    }

    return isMiniWidget;
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

      collector = new SystemCollector(null, { thermalDbPath: resolveThermalDbPath() });
      mobileServer = new MobileLiveServer({ port: 3890, collector });

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
