/**
 * Transporte entre a interface e o PC Sentinel.
 *
 * - desktop: dentro do Electron, fala com o processo principal via IPC (window.sentinelAPI).
 * - web: no celular ou navegador, fala com o servidor do PC via WebSocket (telemetria ao vivo)
 *   e REST (hardware e ações), sempre com o token de pareamento.
 *
 * As duas variantes expõem a mesma interface, então as páginas não sabem onde estão rodando.
 * Recursos que só fazem sentido no PC (configurações, mini widget, reiniciar como admin)
 * existem apenas no modo desktop e são marcados em `capabilities`.
 */

const TOKEN_STORAGE_KEY = 'pc-sentinel-token';

function safeStorage(action, value) {
  try {
    if (action === 'get') return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
  } catch {
    return null;
  }
  return null;
}

function createDesktopTransport(api) {
  return {
    mode: 'desktop',
    capabilities: { settings: true, connection: true, miniWidget: true, elevation: true, updates: true },
    subscribeMetrics: (cb) => api.onMetricsUpdate(cb),
    subscribeSessionReport: (cb) => api.onSessionReport(cb),
    subscribeStatus: (cb) => {
      cb('online');
      return () => {};
    },
    getHardwareInfo: (force) => api.getHardwareInfo(force),
    executeAction: (action, params) => api.executeAction(action, params),
    getServerInfo: () => api.getMobileServerInfo(),
    toggleServer: (start) => api.toggleMobileServer(start),
    revokeToken: () => api.revokeMobileToken(),
    getSettings: () => api.getSettings(),
    updateSettings: (partial) => api.updateSettings(partial),
    toggleMiniWidget: (toMini) => api.toggleMiniWidget(toMini),
    getAppInfo: () => api.getAppInfo(),
    relaunchAsAdmin: () => api.relaunchAsAdmin(),
    getUpdateState: () => api.getUpdateState(),
    checkForUpdates: () => api.checkForUpdates(),
    installUpdate: () => api.installUpdate(),
    openReleaseNotes: (version) => api.openReleaseNotes(version),
    subscribeUpdates: (cb) => api.onUpdateState(cb),
  };
}

function createWebTransport() {
  const params = new URLSearchParams(window.location.search);

  // O token chega pelo link do QR Code; fica guardado para o app instalado na tela inicial
  // (que abre sem a query string) continuar pareado.
  const urlToken = params.get('token');
  if (urlToken) safeStorage('set', urlToken);
  const token = urlToken || safeStorage('get') || '';

  // Servido pelo próprio PC: mesma origem. No dev server Vite: ?port= aponta para o servidor.
  const port = params.get('port');
  const httpBase = port ? `${window.location.protocol}//${window.location.hostname}:${port}` : window.location.origin;
  const wsBase = httpBase.replace(/^http/, 'ws');

  const metricsListeners = new Set();
  const reportListeners = new Set();
  const statusListeners = new Set();
  let status = 'connecting';
  let socket = null;
  let retryTimer = null;
  let retryDelay = 1000;

  const setStatus = (next) => {
    status = next;
    statusListeners.forEach((cb) => cb(next));
  };

  const connect = () => {
    if (socket || metricsListeners.size === 0 || !token) return;
    socket = new WebSocket(`${wsBase}/?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      retryDelay = 1000;
      setStatus('online');
    };

    socket.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'metrics_update' && msg.data) metricsListeners.forEach((cb) => cb(msg.data));
      else if (msg.type === 'session_report' && msg.data) reportListeners.forEach((cb) => cb(msg.data));
      else if (msg.type === 'auth_error') setStatus('unauthorized');
    };

    socket.onclose = (event) => {
      socket = null;
      if (event.code === 4001) {
        setStatus('unauthorized');
        return;
      }
      setStatus('offline');
      if (metricsListeners.size > 0) {
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      }
    };
  };

  const request = async (path, options = {}) => {
    const res = await fetch(`${httpBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (res.status === 401) {
      setStatus('unauthorized');
      throw new Error('Não autorizado: leia o QR Code novamente.');
    }
    const body = await res.json();
    if (!res.ok && body?.success === undefined) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  };

  return {
    mode: 'web',
    capabilities: { settings: false, connection: false, miniWidget: false, elevation: false, updates: false },
    hasToken: Boolean(token),
    subscribeMetrics: (cb) => {
      metricsListeners.add(cb);
      connect();
      return () => {
        metricsListeners.delete(cb);
        if (metricsListeners.size === 0 && socket) {
          clearTimeout(retryTimer);
          socket.close();
        }
      };
    },
    subscribeSessionReport: (cb) => {
      reportListeners.add(cb);
      return () => reportListeners.delete(cb);
    },
    subscribeStatus: (cb) => {
      statusListeners.add(cb);
      cb(token ? status : 'unauthorized');
      return () => statusListeners.delete(cb);
    },
    getHardwareInfo: (force) => request(`/api/hardware${force ? '?forceRefresh=true' : ''}`),
    executeAction: (action, actionParams = {}) =>
      request('/api/action', { method: 'POST', body: JSON.stringify({ action, ...actionParams }) }),
  };
}

let transport = null;

export function getTransport() {
  if (!transport) {
    transport = window.sentinelAPI ? createDesktopTransport(window.sentinelAPI) : createWebTransport();
  }
  return transport;
}
