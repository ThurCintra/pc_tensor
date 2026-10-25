const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT } = require('./paths');

const DEFAULT_SERVICE_PORT = 3891;
const RESTART_DELAYS_MS = [1000, 3000, 10000, 30000];

/** Executável publicado pelo instalador ou compilado em dev (dotnet build / npm run build:service). */
function serviceCandidates() {
  const candidates = [
    path.join(ROOT, 'build', 'service', 'pc-sentinel-service.exe'),
    path.join(
      ROOT,
      'service',
      'PcSentinel.Service',
      'bin',
      'Debug',
      'net10.0-windows',
      'win-x64',
      'pc-sentinel-service.exe',
    ),
  ];
  if (process.resourcesPath) candidates.unshift(path.join(process.resourcesPath, 'service', 'pc-sentinel-service.exe'));
  return candidates;
}

/**
 * Mantém o serviço nativo (service/PcSentinel.Service) rodando enquanto o app estiver aberto.
 * Ele herda a elevação do app (sensores e Stutter Buster precisam de administrador) e grava os dados na
 * mesma pasta (%APPDATA%\pc-sentinel), de onde lê o token de pareamento.
 */
class ServiceProcess {
  constructor({
    dataDir,
    port = DEFAULT_SERVICE_PORT,
    candidates = serviceCandidates(),
    spawnFn = spawn,
    log = console,
  } = {}) {
    this.dataDir = dataDir;
    this.port = port;
    this.candidates = candidates;
    this.spawnFn = spawnFn;
    this.log = log;
    this.child = null;
    this.restarts = 0;
    this.restartTimer = null;
    this.stopped = true;
  }

  /**
   * O executável compilado mais recentemente entre os que existem. Em dev convivem o publicado
   * (npm run build:service) e o do dotnet build/test; pegar sempre o primeiro da lista deixava o app rodando um
   * serviço antigo depois de mudanças no C#. No app instalado só existe o do instalador.
   */
  get executable() {
    let newest = null;
    let newestTime = -Infinity;
    for (const candidate of this.candidates) {
      let time;
      try {
        time = fs.statSync(candidate).mtimeMs;
      } catch {
        continue; // não existe
      }
      if (time > newestTime) {
        newest = candidate;
        newestTime = time;
      }
    }
    return newest;
  }

  get available() {
    return this.executable !== null;
  }

  start() {
    this.stopped = false;
    this.launch();
  }

  launch() {
    if (this.child || this.stopped) return;
    const exe = this.executable;
    if (!exe) {
      this.log.warn('[PC Sentinel] Serviço nativo não encontrado; rode "npm run build:service".');
      return;
    }

    const child = this.spawnFn(
      exe,
      ['--Port', String(this.port), '--DataDir', this.dataDir, '--ParentPid', String(process.pid)],
      {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    this.child = child;
    child.stderr?.on('data', (chunk) => this.log.error(`[pc-sentinel-service] ${String(chunk).trim()}`));
    child.on('error', (err) => this.log.error('[PC Sentinel] Falha ao iniciar o serviço nativo:', err.message));
    child.on('exit', (code) => {
      this.child = null;
      if (this.stopped) return;
      // Reinicia com espera crescente: um serviço que cai em loop não vira um processo a cada segundo
      const delay = RESTART_DELAYS_MS[Math.min(this.restarts, RESTART_DELAYS_MS.length - 1)];
      this.restarts++;
      this.log.warn(`[PC Sentinel] Serviço nativo saiu (código ${code}); reiniciando em ${delay / 1000} s.`);
      this.restartTimer = setTimeout(() => this.launch(), delay);
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

module.exports = { ServiceProcess, DEFAULT_SERVICE_PORT, serviceCandidates };
