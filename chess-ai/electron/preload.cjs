const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neuralChessDesktop', {
  getBootstrap: () => ipcRenderer.invoke('app:get-bootstrap'),
  saveRendererState: (payload) => ipcRenderer.invoke('config:save-renderer-state', payload),
  importLegacyState: (payload) => ipcRenderer.invoke('config:import-legacy-state', payload),
  setApiKey: (apiKey) => ipcRenderer.invoke('config:set-api-key', apiKey),
  clearApiKey: () => ipcRenderer.invoke('config:clear-api-key'),
  requestMove: (payload) => ipcRenderer.invoke('llm:request-move', payload),
  abortMove: (requestId) => ipcRenderer.send('llm:abort-move', requestId),
  onMoveStream: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('llm:move-stream', handler);
    return () => ipcRenderer.removeListener('llm:move-stream', handler);
  },
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openLogsDirectory: () => ipcRenderer.invoke('shell:open-logs-directory'),
  logRendererEvent: (event, meta) => ipcRenderer.send('logs:renderer-event', { event, meta }),
});
