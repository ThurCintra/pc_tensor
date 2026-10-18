const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { SystemCollector } = require('./collector');
const { MobileLiveServer } = require('../server/mobile-server');

// Otimizações de processo: desativa processos sobressalentes do Chromium
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let mainWindow = null;
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

async function createWindow() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const hasIcon = fs.existsSync(iconPath);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
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

  // Ao clicar no "X", minimiza para a bandeja do sistema em vez de fechar
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip('PC Sentinel - Hardware & Thermal Telemetry (Porta 3890)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir PC Sentinel',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Servidor Mobile: Ativo (Porta 3890)',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Sair do PC Sentinel',
      click: () => {
        isQuitting = true;
        if (metricsInterval) clearInterval(metricsInterval);
        if (collector) collector.stop();
        if (mobileServer) mobileServer.stop();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
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
}

// Bloqueio de Instância Única: se o usuário clicar no atalho com o app já rodando,
// foca a janela existente em vez de abrir um segundo processo conflitante.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[PC Sentinel] Uma instância já está em execução. Encerrando processo duplicado.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.whenReady().then(async () => {
    // Configura inicialização automática no Windows para o aplicativo instalado
    if (app.isPackaged) {
      try {
        app.setLoginItemSettings({
          openAtLogin: true,
          path: process.execPath,
          args: [],
        });
      } catch (e) {
        console.error('[PC Sentinel] Erro ao configurar loginItemSettings:', e);
      }
    }

    collector = new SystemCollector();
    mobileServer = new MobileLiveServer({ port: 3890, collector });

    // Inicia automaticamente o servidor mobile local (porta 3890)
    await mobileServer.start();
    console.log('[PC Sentinel] Servidor Mobile WebSocket ativo na porta 3890');

    setupIpc();
    createTray();
    await createWindow();
    startMetricsLoop();
    console.log('[PC Sentinel] Coletor de Telemetria e Interface inicializados com sucesso.');

    app.on('activate', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
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
