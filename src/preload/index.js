const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('sentinelAPI', {
  // Telemetria
  onMetricsUpdate: (callback) => subscribe('metrics:update', callback),
  onSessionReport: (callback) => subscribe('session:report', callback),
  fetchSnapshot: () => ipcRenderer.invoke('metrics:snapshot'),
  getHardwareInfo: (forceRefresh) => ipcRenderer.invoke('hardware:info', forceRefresh),

  // Ações remotas (encerrar processo, plano de energia, Boost, mídia)
  executeAction: (action, params = {}) => ipcRenderer.invoke('action:execute', { action, ...params }),

  // Servidor do celular
  getMobileServerInfo: () => ipcRenderer.invoke('mobile-server:get-info'),
  toggleMobileServer: (start) => ipcRenderer.invoke('mobile-server:toggle', start),
  revokeMobileToken: () => ipcRenderer.invoke('mobile-server:revoke-token'),

  // Preferências persistentes
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),

  // Janela e aplicativo
  toggleMiniWidget: (toMini) => ipcRenderer.invoke('window:toggle-mini-widget', toMini),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  relaunchAsAdmin: () => ipcRenderer.invoke('app:relaunch-as-admin'),
  openSensorDriverPage: () => ipcRenderer.invoke('app:open-sensor-driver-page'),

  // Serviço nativo .NET (WebSocket v2)
  getServiceEndpoint: () => ipcRenderer.invoke('service:endpoint'),

  // Atualizações (electron-updater)
  getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openReleaseNotes: (version) => ipcRenderer.invoke('updates:open-notes', version),
  onUpdateState: (callback) => subscribe('updates:state', callback),
});
