const { BrowserWindow, nativeTheme, screen } = require('electron');
const fs = require('fs');
const http = require('http');
const { paths } = require('./paths');

const NORMAL_SIZE = { width: 1180, height: 780 };
const NORMAL_MIN_SIZE = [760, 540];
const MINI_SIZE = [340, 84];
const MINI_MIN_SIZE = [300, 84];

/**
 * Janela principal, janela do QR Code e modo mini-widget. Fechar a janela principal destrói o
 * renderer (libera RAM e GPU) enquanto coleta e servidor do celular seguem rodando na bandeja.
 */
class WindowManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.mainWindow = null;
    this.qrWindow = null;
    this.isMiniWidget = false;
    this.normalBounds = { ...NORMAL_SIZE };
    this.loadedFromViteDev = false;
    /** Última leitura recebida, entregue na hora quando a janela volta a aparecer. */
    this.lastMetrics = null;
  }

  /** Cor de fundo igual à do tema do Windows (evita flash branco/preto ao abrir). */
  background() {
    return nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3';
  }

  send(channel, payload) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }

  /**
   * A janela está na tela para alguém ver? Minimizada ou escondida, não; o mini-widget fica sempre à vista.
   * Janela fechada não conta: ela é destruída (hibernateMain) e não recebe nada.
   */
  isMainOnScreen() {
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return false;
    if (this.isMiniWidget) return !win.isMinimized();
    return win.isVisible() && !win.isMinimized();
  }

  /**
   * Modo eco: métricas (a cada 1,2 s) só vão para a janela quando ela está na tela. Minimizada durante um jogo,
   * o React não recalcula a interface à toa. A coleta, os alertas, o celular e o serviço nativo continuam iguais;
   * só a entrega para a janela invisível é pulada. Devolve se entregou.
   */
  sendMetrics(metrics) {
    this.lastMetrics = metrics;
    if (!this.isMainOnScreen()) return false;
    this.send('metrics:update', metrics);
    return true;
  }

  /** Janela voltou (restaurada ou mostrada): entrega a leitura mais recente na hora, sem esperar o próximo ciclo. */
  flushMetrics() {
    if (this.lastMetrics && this.isMainOnScreen()) this.send('metrics:update', this.lastMetrics);
  }

  async showMain() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
    } else {
      await this.createMain();
    }
  }

  async createMain() {
    const { app } = require('electron');
    const bounds = this.normalBounds;

    this.mainWindow = new BrowserWindow({
      width: bounds.width || NORMAL_SIZE.width,
      height: bounds.height || NORMAL_SIZE.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: NORMAL_MIN_SIZE[0],
      minHeight: NORMAL_MIN_SIZE[1],
      backgroundColor: this.background(),
      title: 'PC Sentinel',
      icon: fs.existsSync(paths.icon) ? paths.icon : undefined,
      autoHideMenuBar: true,
      webPreferences: {
        preload: paths.preload,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Em `npm run dev` usa o Vite com hot reload; fora dele, o build em dist/
    this.loadedFromViteDev = !app.isPackaged && (await isServerReachable(paths.devServerUrl));
    if (this.loadedFromViteDev) {
      await this.mainWindow.loadURL(paths.devServerUrl);
    } else if (fs.existsSync(paths.rendererIndex)) {
      await this.mainWindow.loadFile(paths.rendererIndex);
    } else {
      console.error('[PC Sentinel] dist/index.html não encontrado. Rode "npm run build".');
    }

    this.mainWindow.on('close', (event) => {
      if (!this.ctx.isQuitting) {
        event.preventDefault();
        this.hibernateMain();
      }
    });
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
    // Saiu do modo eco: a tela não fica parada na última leitura de antes de minimizar
    this.mainWindow.on('restore', () => this.flushMetrics());
    this.mainWindow.on('show', () => this.flushMetrics());
  }

  /** Destrói o renderer guardando posição e tamanho para reabrir no mesmo lugar. */
  hibernateMain() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    try {
      if (!this.isMiniWidget) this.normalBounds = this.mainWindow.getBounds();
      this.mainWindow.destroy();
    } finally {
      this.mainWindow = null;
    }
  }

  toggleMiniWidget(toMini) {
    const win = this.mainWindow;
    if (!win) return false;
    this.isMiniWidget = typeof toMini === 'boolean' ? toMini : !this.isMiniWidget;

    if (this.isMiniWidget) {
      this.normalBounds = win.getBounds();
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setMinimumSize(...MINI_MIN_SIZE);
      win.setSize(...MINI_SIZE);
      const { width } = screen.getPrimaryDisplay().workAreaSize;
      win.setPosition(width - MINI_SIZE[0] - 10, 40);
    } else {
      const { width, height, x, y } = this.normalBounds;
      win.setAlwaysOnTop(false);
      win.setMinimumSize(...NORMAL_MIN_SIZE);
      win.setSize(width || NORMAL_SIZE.width, height || NORMAL_SIZE.height);
      if (x && y) win.setPosition(x, y);
      else win.center();
    }
    return this.isMiniWidget;
  }

  async showQr() {
    if (this.qrWindow && !this.qrWindow.isDestroyed()) {
      this.qrWindow.focus();
      return;
    }

    const info = await this.ctx.mobileServer.getServerInfo();
    this.qrWindow = new BrowserWindow({
      width: 360,
      height: 470,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      backgroundColor: this.background(),
      title: 'PC Sentinel - Conectar celular',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    this.qrWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(qrPageHtml(info))}`);
    this.qrWindow.on('closed', () => {
      this.qrWindow = null;
    });
  }

  destroyAll() {
    for (const win of [this.qrWindow, this.mainWindow]) {
      if (win && !win.isDestroyed()) win.destroy();
    }
  }
}

function isServerReachable(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value || '').replace(/[&<>"']/g, (c) => entities[c]);
}

function qrPageHtml({ url, qrCodeDataUrl }) {
  return `<!DOCTYPE html>
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
    <div class="card"><img src="${escapeHtml(qrCodeDataUrl)}" alt="QR Code de pareamento" /></div>
    <div class="url">${escapeHtml(url)}</div>
  </body>
</html>`;
}

module.exports = { WindowManager, escapeHtml };
