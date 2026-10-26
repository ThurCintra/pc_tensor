const { app } = require('electron');
const path = require('path');

const { SystemCollector } = require('./telemetry/collector');
const { HybridSensorSource, ServiceSensorSource } = require('./telemetry/hybrid-sensors');
const { ThermalAlertMonitor } = require('./telemetry/thermal-alerts');
const { MobileLiveServer } = require('../server/mobile-server');
const { SettingsStore } = require('./settings-store');
const { WindowManager } = require('./windows');
const { TrayController } = require('./tray');
const { registerIpcHandlers } = require('./ipc');
const { UpdateService } = require('./updater');
const { ServiceProcess } = require('./service-process');
const system = require('./system');

const METRICS_INTERVAL_MS = 1200;

// Mesma pasta de dados em dev (`electron .`) e no app instalado: %APPDATA%\pc-sentinel.
// PC_SENTINEL_DATA_DIR usa outra pasta (e outra trava de instância única): roda uma cópia de
// desenvolvimento ao lado do app instalado sem misturar configurações.
app.setPath('userData', process.env.PC_SENTINEL_DATA_DIR || path.join(app.getPath('appData'), 'pc-sentinel'));

// Desativa o processo de renderer reserva do Chromium e não reduz timers em segundo plano
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');
app.commandLine.appendSwitch('disable-background-timer-throttling');

/** Estado compartilhado entre janelas, bandeja e IPC. */
const ctx = {
  isQuitting: false,
  isElevated: false,
  autoLaunch: system.autoLaunch,
  settingsStore: null,
  collector: null,
  mobileServer: null,
  alertMonitor: null,
  windows: null,
  tray: null,
  updates: null,
  service: null,
  metricsTimer: null,
};

const actions = {
  showMain: () => ctx.windows.showMain(),
  showQr: () => ctx.windows.showQr(),
  refreshTray: () => ctx.tray.refresh(),

  setAutoLaunch(enabled) {
    ctx.autoLaunch.set(enabled);
    ctx.tray.refresh();
  },

  async boost() {
    const result = await ctx.mobileServer.actionRouter.boostCleanup();
    system.notify({ title: 'PC Sentinel - Modo Boost', body: result.message });
  },

  shutdown() {
    ctx.isQuitting = true;
    clearInterval(ctx.metricsTimer);
    ctx.updates?.stop();
    ctx.mobileServer?.actionRouter?.dispose();
    ctx.service?.stop();
    ctx.collector?.stop();
    ctx.collector = null;
  },

  /** Encerra coleta e servidor (libera a porta para a versão nova) e roda o instalador baixado. */
  async installUpdate() {
    if (ctx.updates.getState().status !== 'downloaded') return false;
    actions.shutdown();
    await ctx.mobileServer?.stop();
    return ctx.updates.install();
  },

  quit() {
    actions.shutdown();
    ctx.mobileServer?.stop();
    ctx.windows.destroyAll();
    app.quit();
  },

  /**
   * Reabre o app como administrador para liberar os sensores. Solta a trava de instância única e
   * a porta antes, para a nova instância assumir; se o UAC for recusado, segue como estava.
   */
  async relaunchAsAdmin() {
    if (ctx.isElevated) return { success: false, error: 'ALREADY_ELEVATED' };

    app.releaseSingleInstanceLock();
    await ctx.mobileServer.stop();

    if (!(await system.launchElevatedCopy())) {
      app.requestSingleInstanceLock();
      await ctx.mobileServer.start();
      return { success: false, error: 'UAC_DECLINED', message: 'A elevação foi cancelada.' };
    }

    actions.shutdown();
    setTimeout(() => app.quit(), 200);
    return { success: true };
  },
};

function startMetricsLoop() {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const metrics = await ctx.collector.getMetricsSnapshot();
      metrics.alerts = ctx.alertMonitor.evaluate(metrics);
      ctx.windows.sendMetrics(metrics); // pula a janela minimizada (modo eco)
      ctx.mobileServer.broadcastMetrics(metrics);
    } catch (err) {
      console.error('[PC Sentinel] Erro no loop de métricas:', err);
    } finally {
      busy = false;
    }
  };

  tick();
  ctx.metricsTimer = setInterval(tick, METRICS_INTERVAL_MS);
  ctx.collector.on('SESSION_REPORT_READY', (report) => ctx.windows.send('session:report', report));
}

async function bootstrap() {
  system.autoLaunch.configureOnFirstRun();
  ctx.isElevated = await system.detectElevation();

  ctx.settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
  const settings = ctx.settingsStore.get();

  // Serviço nativo .NET (contrato v2): roda ao lado do coletor Node enquanto a interface migra
  ctx.service = new ServiceProcess({ dataDir: app.getPath('userData') });
  ctx.service.start();

  // Sensores: do serviço nativo quando ele está no ar; a ponte legada só assume se ele faltar (sem os dois
  // lendo o LibreHardwareMonitor ao mesmo tempo)
  const serviceSensors = new ServiceSensorSource({
    getEndpoint: () =>
      ctx.service?.available
        ? { url: `ws://127.0.0.1:${ctx.service.port}/ws`, token: ctx.settingsStore.sessionToken }
        : null,
  });
  ctx.collector = new SystemCollector({
    thermalDbPath: system.resolveThermalDbPath(),
    sensorBridge: new HybridSensorSource({ service: serviceSensors }),
  });
  ctx.mobileServer = new MobileLiveServer({
    port: settings.mobilePort,
    collector: ctx.collector,
    sessionToken: ctx.settingsStore.sessionToken,
  });
  ctx.mobileServer.actionRouter.setBoostTargets(settings.boostTargets);

  ctx.alertMonitor = new ThermalAlertMonitor({
    getSettings: () => ctx.settingsStore.get(),
    notify: (alert) =>
      system.notify({
        title: `PC Sentinel - ${alert.label} acima de ${alert.limit} °C`,
        body: `${alert.label} atingiu ${alert.temp.toFixed(1)} °C. Verifique a refrigeração ou reduza a carga.`,
        urgency: 'critical',
      }),
  });

  try {
    await ctx.mobileServer.start();
  } catch (err) {
    console.warn('[PC Sentinel] Servidor do celular não iniciou:', err.message);
  }

  ctx.windows = new WindowManager(ctx);
  ctx.tray = new TrayController(ctx, actions);
  ctx.updates = new UpdateService({
    updater: app.isPackaged ? require('electron-updater').autoUpdater : null,
    supported: app.isPackaged,
    currentVersion: app.getVersion(),
    notify: system.notify,
    checkOnStartup: () => ctx.settingsStore.get().updates.checkOnStartup,
  });
  ctx.updates.on('state', (state) => ctx.windows.send('updates:state', state));

  registerIpcHandlers(ctx, actions);
  ctx.tray.create();
  await ctx.windows.createMain();
  startMetricsLoop();
  ctx.updates.start();
}

// Instância única: abrir o atalho com o app rodando só traz a janela existente para frente
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => actions.showMain());
  app.on('before-quit', () => {
    ctx.isQuitting = true;
  });
  app.on('activate', () => ctx.windows && actions.showMain());

  // Fechar a janela só esconde o app na bandeja; ele encerra pelo menu "Sair"
  app.on('window-all-closed', async () => {
    if (!ctx.isQuitting) return;
    actions.shutdown();
    await ctx.mobileServer?.stop();
    app.quit();
  });

  app.whenReady().then(bootstrap);
}
