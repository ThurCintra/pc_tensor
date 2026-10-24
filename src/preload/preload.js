const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sentinelAPI', {
  // Recebe atualizações periódicas de telemetria
  onMetricsUpdate: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('metrics:update', subscription);
    return () => ipcRenderer.removeListener('metrics:update', subscription);
  },

  // Obtém status e configurações do servidor mobile
  getMobileServerInfo: () => ipcRenderer.invoke('mobile-server:get-info'),

  // Liga/desliga o streaming mobile
  toggleMobileServer: (start) => ipcRenderer.invoke('mobile-server:toggle', start),

  // Revoga o pareamento atual (novo token, desconecta todos os celulares)
  revokeMobileToken: () => ipcRenderer.invoke('mobile-server:revoke-token'),

  // Preferências persistentes (alertas térmicos, Boost, porta, iniciar com o Windows)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),

  // Snapshot manual sob demanda
  fetchSnapshot: () => ipcRenderer.invoke('metrics:snapshot'),

  // Alterna Modo Mini-Widget flutuante compacto
  toggleMiniWidget: (toMini) => ipcRenderer.invoke('window:toggle-mini-widget', toMini),

  // Inventário completo e estático de hardware (Raio-X do PC)
  getHardwareInfo: (forceRefresh) => ipcRenderer.invoke('hardware:info', forceRefresh),

  // FASE 4: Execução de ações do Stream Deck (Kill, Boost, Planos de Energia, Mídia)
  executeAction: (action, params = {}) => ipcRenderer.invoke('action:execute', { action, ...params }),

  // FASE 4: Recebe relatórios pós-sessão de benchmark emitidos pelo backend
  onSessionReport: (callback) => {
    const subscription = (event, report) => callback(report);
    ipcRenderer.on('session:report', subscription);
    return () => ipcRenderer.removeListener('session:report', subscription);
  },
});
