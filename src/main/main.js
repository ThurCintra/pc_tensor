const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
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

const http = require('http');
const fs = require('fs');

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
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0B0F19',
    title: 'PC Sentinel - Hardware & Thermal Telemetry',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  const devUrl = 'http://localhost:5173';
  const distPath = path.join(__dirname, '../../dist/index.html');
  const bootstrapPath = path.join(__dirname, '../server/public/index.html');

  const isViteUp = await isServerReachable(devUrl);

  if (isViteUp) {
    await mainWindow.loadURL(devUrl);
  } else if (fs.existsSync(distPath)) {
    await mainWindow.loadFile(distPath);
  } else if (fs.existsSync(bootstrapPath)) {
    await mainWindow.loadFile(bootstrapPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
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

app.whenReady().then(async () => {
  collector = new SystemCollector();
  mobileServer = new MobileLiveServer({ port: 3890 });

  // Inicia automaticamente o servidor mobile local
  await mobileServer.start();

  setupIpc();
  await createWindow();
  startMetricsLoop();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (metricsInterval) clearInterval(metricsInterval);
  if (mobileServer) await mobileServer.stop();
  if (process.platform !== 'darwin') app.quit();
});
