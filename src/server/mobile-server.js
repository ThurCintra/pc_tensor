const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

class MobileLiveServer {
  constructor(options = {}) {
    this.port = options.port || 3890;
    this.app = express();
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.isRunning = false;
    this.localIp = this.detectLocalIp();

    this.setupRoutes();
  }

  detectLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Ignora endereços de loopback e IPv6 internos
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  setupRoutes() {
    // Servir arquivos estáticos da página web móvel
    const publicPath = path.join(__dirname, 'public');
    this.app.use(express.static(publicPath));

    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'PC Sentinel Live Mobile Stream',
        status: 'online',
        hostname: os.hostname(),
        platform: os.platform(),
      });
    });
  }

  async start() {
    if (this.isRunning) return this.getServerInfo();

    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      // Envia confirmação de boas-vindas
      ws.send(JSON.stringify({ type: 'connected', message: 'Conectado ao PC Sentinel Mobile Stream' }));

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    await new Promise((resolve, reject) => {
      this.server.listen(this.port, '0.0.0.0', () => {
        this.isRunning = true;
        resolve();
      });
      this.server.on('error', reject);
    });

    return this.getServerInfo();
  }

  async stop() {
    if (!this.isRunning) return;

    for (const client of this.clients) {
      try {
        client.close();
      } catch (e) {}
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
    }

    this.isRunning = false;
  }

  broadcastMetrics(metrics) {
    if (!this.isRunning || this.clients.size === 0) return;

    const payload = JSON.stringify({
      type: 'metrics_update',
      data: metrics,
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  async getServerInfo() {
    const mobileUrl = `http://${this.localIp}:${this.port}`;
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(mobileUrl, {
        margin: 1,
        color: {
          dark: '#00f0ff',
          light: '#0a0e17',
        },
      });
    } catch (e) {
      qrDataUrl = '';
    }

    return {
      isRunning: this.isRunning,
      port: this.port,
      localIp: this.localIp,
      url: mobileUrl,
      qrCodeDataUrl: qrDataUrl,
      connectedClientsCount: this.clients.size,
    };
  }
}

module.exports = { MobileLiveServer };
