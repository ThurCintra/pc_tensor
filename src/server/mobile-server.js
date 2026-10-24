const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const { ActionRouter } = require('./action-router');

// Origens de navegador autorizadas a chamar a API de outra origem (dev server Vite)
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

// Adaptadores virtuais/VPN que não são alcançáveis pelo celular na LAN
const VIRTUAL_IFACE_PATTERN = /(vethernet|wsl|hyper-v|virtualbox|vbox|vmware|docker|loopback|bluetooth|tailscale|zerotier|hamachi|radmin|npcap|teredo)/i;

/**
 * Escolhe o IPv4 mais provável de ser alcançável pelo celular na mesma rede:
 * ignora loopback, link-local (169.254.x) e adaptadores virtuais (WSL, Hyper-V, VPNs),
 * priorizando faixas privadas típicas de roteadores domésticos.
 */
function pickLocalIp(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const name of Object.keys(interfaces || {})) {
    for (const iface of interfaces[name] || []) {
      const isV4 = iface.family === 'IPv4' || iface.family === 4;
      if (!isV4 || iface.internal || !iface.address || iface.address.startsWith('169.254.')) continue;

      let score = 0;
      if (!VIRTUAL_IFACE_PATTERN.test(name)) score += 100;
      if (iface.address.startsWith('192.168.')) score += 30;
      else if (iface.address.startsWith('10.')) score += 20;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(iface.address)) score += 10;
      candidates.push({ address: iface.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
}

function extractToken(req) {
  const fromQuery = req.query?.token;
  if (fromQuery) return String(fromQuery);
  const headers = req.headers || {};
  if (headers['x-session-token']) return String(headers['x-session-token']);
  const auth = headers['authorization'];
  if (auth) return String(auth).replace(/^Bearer\s+/i, '');
  return null;
}

class MobileLiveServer {
  constructor(options = {}) {
    this.port = options.port || 3890;
    this.host = options.host || '0.0.0.0';
    this.collector = null;
    this.lastMetrics = null;
    this.app = express();
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.isRunning = false;
    this.localIp = this.detectLocalIp();
    this.allowedOrigins = new Set(options.allowedOrigins || DEFAULT_ALLOWED_ORIGINS);
    this.execFile = options.execFile || execFile;
    this.manageFirewall = options.manageFirewall ?? process.platform === 'win32';
    this.firewallRulesEnsured = new Set();
    this.handleSessionReport = (report) => this.broadcastSessionReport(report);

    // FASE 2: Autenticação por Token Efêmero de Sessão
    this.sessionToken = options.sessionToken || crypto.randomUUID();
    this.requireAuth = options.requireAuth ?? true;

    // FASE 2: Roteador de Ações Seguras (Stream Deck)
    this.actionRouter = options.actionRouter || new ActionRouter({ collector: options.collector || null });

    this.setupRoutes();
    this.setCollector(options.collector || null);
  }

  setCollector(collector) {
    // Remove o listener do coletor anterior para não duplicar broadcasts
    if (this.collector && typeof this.collector.off === 'function') {
      this.collector.off('SESSION_REPORT_READY', this.handleSessionReport);
    }
    this.collector = collector;
    if (this.actionRouter) {
      this.actionRouter.setCollector(collector);
    }
    if (this.collector && typeof this.collector.on === 'function') {
      this.collector.on('SESSION_REPORT_READY', this.handleSessionReport);
    }
  }

  detectLocalIp() {
    return pickLocalIp();
  }

  isTokenValid(token) {
    if (!this.requireAuth) return true;
    if (!token || !this.sessionToken) return false;
    const a = Buffer.from(String(token));
    const b = Buffer.from(String(this.sessionToken));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Aceita requisições sem Origin (clientes não-browser), da mesma origem do servidor
   * ou de origens explicitamente autorizadas (dev server Vite).
   */
  isOriginAllowed(origin, hostHeader) {
    if (!origin) return true;
    if (hostHeader && (origin === `http://${hostHeader}` || origin === `https://${hostHeader}`)) return true;
    return this.allowedOrigins.has(origin);
  }

  setupRoutes() {
    // CORS restrito: impede que sites arbitrários abertos no navegador chamem a API local
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (!this.isOriginAllowed(origin, req.headers.host)) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN_ORIGIN', message: 'Origem não autorizada.' });
      }
      if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');
      }
      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      next();
    });

    this.app.use(express.json({ limit: '16kb' }));

    const requireToken = (req, res, next) => {
      if (this.isTokenValid(extractToken(req))) return next();
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Token de autenticação ausente ou inválido.',
      });
    };

    // Servir arquivos estáticos da aplicação web móvel compatível com app.asar
    let publicPath = path.join(__dirname, 'public');
    if (publicPath.includes('app.asar')) {
      const unpacked = publicPath.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) {
        publicPath = unpacked;
      }
    }
    this.app.use(express.static(publicPath));

    // Info do Servidor: sem token devolve apenas o status público (nunca o token de sessão)
    this.app.get('/api/info', async (req, res) => {
      const base = {
        name: 'PC Sentinel Live Mobile Stream',
        status: this.isRunning ? 'online' : 'offline',
        platform: os.platform(),
      };
      if (!this.isTokenValid(extractToken(req))) {
        return res.json({ ...base, ...this.getPublicInfo(), authenticated: false });
      }
      const serverInfo = await this.getServerInfo();
      return res.json({ ...base, hostname: os.hostname(), ...serverInfo, authenticated: true });
    });

    // Telemetria em tempo real (Snapshot)
    this.app.get('/api/metrics', requireToken, async (req, res) => {
      try {
        if (this.hasFreshMetrics()) {
          return res.json(this.lastMetrics);
        }
        if (this.collector) {
          const snapshot = await this.collector.getMetricsSnapshot();
          this.lastMetrics = snapshot;
          return res.json(snapshot);
        }
        if (this.lastMetrics) {
          return res.json(this.lastMetrics);
        }
        return res.status(503).json({ error: 'Telemetria ainda não inicializada' });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    });

    // Inventário Completo de Hardware (Raio-X do PC)
    this.app.get('/api/hardware', requireToken, async (req, res) => {
      try {
        const forceRefresh = req.query.forceRefresh === 'true';
        if (this.collector && typeof this.collector.getHardwareInfo === 'function') {
          const info = await this.collector.getHardwareInfo(forceRefresh);
          return res.json(info);
        }

        // Fallback gracioso caso coletor não esteja injetado
        return res.json(this.getMockHardwareInfo());
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    });

    // Controle de Streaming (Ligar / Desligar)
    this.app.post('/api/server/toggle', requireToken, async (req, res) => {
      try {
        const { shouldStart } = req.body || {};
        const targetState = typeof shouldStart === 'boolean' ? shouldStart : !this.isRunning;
        if (targetState && !this.isRunning) {
          await this.start();
        } else if (!targetState && this.isRunning) {
          await this.stop();
        }
        const info = await this.getServerInfo();
        return res.json(info);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    });

    // Execução de Ações / Stream Deck (REST)
    this.app.post('/api/action', requireToken, async (req, res) => {
      try {
        const result = await this.actionRouter.handleAction(req.body);
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
      }
    });
  }

  getMockHardwareInfo() {
    return {
      os: {
        osName: `${os.type()} ${os.release()}`,
        build: 'N/A',
        arch: os.arch(),
        hostname: os.hostname(),
        agentVersion: '0.1.0',
        uptimeSeconds: Math.round(os.uptime()),
      },
      motherboard: {
        manufacturer: 'Host System',
        model: 'Universal Host Board',
        biosVersion: '1.0',
        biosDate: '2025',
      },
      cpu: {
        name: (os.cpus()[0]?.model || 'Host CPU').trim(),
        cores: os.cpus().length,
        threads: os.cpus().length,
        baseSpeedMHz: os.cpus()[0]?.speed || 3000,
        maxSpeedMHz: os.cpus()[0]?.speed || 4000,
        socket: 'Integrated',
        l1CacheBytes: 256 * 1024,
        l2CacheBytes: 2 * 1024 * 1024,
        l3CacheBytes: 16 * 1024 * 1024,
      },
      gpus: [
        {
          vendor: 'GPU',
          name: 'Placa Gráfica do Host',
          vramTotalBytes: 8 * 1024 * 1024 * 1024,
          driverVersion: 'Standard',
          bus: 'PCIe',
        },
      ],
      ram: {
        totalBytes: os.totalmem(),
        type: 'DDR4/DDR5',
        speedMHz: 3200,
        channelMode: 'Multi-Channel',
        slots: [
          {
            slot: 'Slot 1',
            capacityBytes: os.totalmem(),
            manufacturer: 'Standard',
            partNumber: 'HostRAM',
            speedMHz: 3200,
          },
        ],
      },
      disks: [
        {
          id: 'C:',
          label: 'C:',
          type: 'SSD',
          totalBytes: 500 * 1024 * 1024 * 1024,
          fs: 'NTFS',
          model: 'Host Drive',
        },
      ],
      network: {
        interface: 'Default Network',
        localIp: this.localIp,
        type: 'Ethernet/Wi-Fi',
        macAddress: '00:00:00:00:00:00',
        linkSpeedMbps: 1000,
      },
      capabilities: {
        cpuTemperature: true,
        gpuTemperature: true,
        gpuPower: false,
        perCoreLoad: true,
      },
    };
  }

  async start() {
    if (this.isRunning) return this.getServerInfo();

    if (!this.sessionToken) {
      this.sessionToken = crypto.randomUUID();
    }

    const maxPortAttempts = 5;
    let currentAttempt = 0;
    let boundSuccessfully = false;

    while (!boundSuccessfully && currentAttempt < maxPortAttempts) {
      const targetPort = this.port + currentAttempt;
      currentAttempt++;

      const serverCandidate = http.createServer(this.app);
      const wssCandidate = new WebSocketServer({
        server: serverCandidate,
        maxPayload: 64 * 1024,
        verifyClient: ({ origin, req }) => this.isOriginAllowed(origin, req.headers.host),
      });

      const bound = await new Promise((resolve) => {
        serverCandidate.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[MobileLiveServer] Porta ${targetPort} já em uso. Tentando porta alternativa ${targetPort + 1}...`);
            try { wssCandidate.close(); } catch {}
            try { serverCandidate.close(); } catch {}
            resolve(false);
          } else {
            console.error(`[MobileLiveServer] Erro ao vincular servidor na porta ${targetPort}:`, err);
            try { wssCandidate.close(); } catch {}
            try { serverCandidate.close(); } catch {}
            resolve(false);
          }
        });

        serverCandidate.listen(targetPort, this.host, () => {
          this.port = targetPort;
          this.server = serverCandidate;
          this.wss = wssCandidate;
          this.isRunning = true;
          this.setupWebSocketListeners(this.wss);
          resolve(true);
        });
      });

      if (bound) {
        boundSuccessfully = true;
        console.log(`[MobileLiveServer] Ouvindo em ${this.host}:${this.port} - IP Local: ${this.localIp}`);
        this.ensureFirewallRule(this.port);
      }
    }

    if (!boundSuccessfully) {
      console.warn(`[MobileLiveServer] Não foi possível vincular a nenhuma porta nas proximidades de ${this.port}.`);
    }

    return this.getServerInfo();
  }

  /**
   * Cria a regra de entrada do firewall apenas se ela ainda não existir
   * (netsh aceita nomes repetidos e duplicaria a regra a cada inicialização).
   */
  ensureFirewallRule(port) {
    if (!this.manageFirewall || this.firewallRulesEnsured.has(port)) return;
    this.firewallRulesEnsured.add(port);
    const ruleName = `name=PC Sentinel LAN (${port})`;
    try {
      this.execFile('netsh', ['advfirewall', 'firewall', 'show', 'rule', ruleName], { windowsHide: true }, (showErr) => {
        if (!showErr) return;
        this.execFile('netsh', [
          'advfirewall', 'firewall', 'add', 'rule', ruleName,
          'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`,
        ], { windowsHide: true }, (addErr) => {
          if (addErr) {
            console.warn(`[MobileLiveServer] Não foi possível criar a regra de firewall da porta ${port} (requer Administrador).`);
          }
        });
      });
    } catch (e) {}
  }

  setupWebSocketListeners(wss) {
    wss.on('connection', (ws, req) => {
      let clientToken = null;
      try {
        if (req && req.url) {
          const parsedUrl = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
          clientToken = parsedUrl.searchParams.get('token');
        }
      } catch {}

      if (!clientToken && req?.headers) {
        clientToken = req.headers['x-session-token'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      }

      if (!this.isTokenValid(clientToken)) {
        try {
          ws.send(JSON.stringify({
            type: 'auth_error',
            error: 'UNAUTHORIZED',
            message: 'Acesso negado: token de autenticação ausente ou inválido.',
          }));
          ws.close(4001, 'Unauthorized');
        } catch {}
        return;
      }

      ws.isAuthenticated = true;
      this.clients.add(ws);

      // Envia confirmação de boas-vindas com dados de autenticação
      const serverUrl = `http://${this.localIp}:${this.port}/?token=${this.sessionToken}`;
      ws.send(JSON.stringify({ 
        type: 'connected', 
        message: 'Conectado ao PC Sentinel Mobile Stream',
        serverInfo: {
          url: serverUrl,
          localIp: this.localIp,
          port: this.port,
          authenticated: true,
        }
      }));

      // Se já houver última métrica armazenada, envia imediatamente ao novo cliente
      if (this.lastMetrics) {
        try {
          ws.send(JSON.stringify({
            type: 'metrics_update',
            data: this.lastMetrics,
          }));
        } catch (e) {}
      }

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // FASE 2: Roteador de Comandos Bidirecionais (Mobile -> PC)
          const isActionMsg = msg.type === 'action' || 
                              msg.type === 'ACTION' || 
                              ['KILL_PROCESS', 'SET_POWER_PLAN', 'BOOST_CLEANUP', 'MEDIA_AUDIO_CONTROL'].includes(msg.type);

          if (isActionMsg) {
            if (this.requireAuth && !ws.isAuthenticated) {
              ws.send(JSON.stringify({
                type: 'action_result',
                requestId: msg.requestId,
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Cliente não autenticado para executar comandos remotos.',
              }));
              return;
            }

            const actionPayload = (msg.type === 'action' || msg.type === 'ACTION') ? msg : { ...msg, action: msg.type };
            const result = await this.actionRouter.handleAction(actionPayload);
            ws.send(JSON.stringify({
              type: 'action_result',
              ...result,
            }));
            return;
          }

          if (msg.type === 'get_hardware') {
            const forceRefresh = !!msg.forceRefresh;
            let hwData = null;
            if (this.collector && typeof this.collector.getHardwareInfo === 'function') {
              hwData = await this.collector.getHardwareInfo(forceRefresh);
            } else {
              hwData = this.getMockHardwareInfo();
            }
            ws.send(JSON.stringify({ type: 'hardware_update', data: hwData }));
          } else if (msg.type === 'get_metrics') {
            if (this.hasFreshMetrics()) {
              ws.send(JSON.stringify({ type: 'metrics_update', data: this.lastMetrics }));
            } else if (this.collector) {
              const snapshot = await this.collector.getMetricsSnapshot();
              this.lastMetrics = snapshot;
              ws.send(JSON.stringify({ type: 'metrics_update', data: snapshot }));
            } else if (this.lastMetrics) {
              ws.send(JSON.stringify({ type: 'metrics_update', data: this.lastMetrics }));
            }
          }
        } catch (e) {}
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
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
      const closing = new Promise((resolve) => this.server.close(resolve));
      // Conexões HTTP keep-alive impediriam o close de terminar (troca de porta)
      if (typeof this.server.closeAllConnections === 'function') {
        this.server.closeAllConnections();
      }
      await closing;
    }

    this.isRunning = false;
  }

  broadcastMetrics(metrics) {
    this.lastMetrics = metrics;
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

  broadcastSessionReport(report) {
    if (!this.isRunning || this.clients.size === 0) return;

    const payload = JSON.stringify({
      type: 'session_report',
      data: report,
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {}
      }
    }
  }

  /**
   * Revoga o pareamento atual: troca o token e desconecta todos os dispositivos.
   */
  rotateToken(newToken = crypto.randomUUID()) {
    this.sessionToken = newToken;
    for (const client of this.clients) {
      try {
        client.close(4001, 'Token revoked');
      } catch {}
    }
    this.clients.clear();
    return this.getServerInfo();
  }

  /**
   * Reinicia o servidor em outra porta (mantém o token).
   */
  async changePort(port) {
    const wasRunning = this.isRunning;
    if (wasRunning) await this.stop();
    this.port = port;
    return wasRunning ? this.start() : this.getServerInfo();
  }

  /**
   * O loop principal transmite um snapshot a cada ~1,2 s já enriquecido (alertas térmicos);
   * reaproveitá-lo evita coletas extras e mantém REST e WebSocket consistentes.
   */
  hasFreshMetrics(maxAgeMs = 3000) {
    const ts = this.lastMetrics?.timestamp;
    return typeof ts === 'number' && Date.now() - ts < maxAgeMs;
  }

  getPublicInfo() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      localIp: this.localIp,
      url: `http://${this.localIp}:${this.port}`,
    };
  }

  async getServerInfo() {
    const mobileUrl = this.sessionToken
      ? `http://${this.localIp}:${this.port}/?token=${this.sessionToken}`
      : `http://${this.localIp}:${this.port}`;

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
      sessionToken: this.sessionToken,
      qrCodeDataUrl: qrDataUrl,
      connectedClientsCount: this.clients.size,
    };
  }
}

module.exports = { MobileLiveServer, ActionRouter, pickLocalIp };
