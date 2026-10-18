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

  // Snapshot manual sob demanda
  fetchSnapshot: () => ipcRenderer.invoke('metrics:snapshot'),

  // Alterna Modo Mini-Widget flutuante compacto
  toggleMiniWidget: (toMini) => ipcRenderer.invoke('window:toggle-mini-widget', toMini),

  // Inventário completo e estático de hardware (Raio-X do PC)
  getHardwareInfo: (forceRefresh) => ipcRenderer.invoke('hardware:info', forceRefresh),
});
