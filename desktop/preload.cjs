const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vaultDesktop', {
  load: () => ipcRenderer.invoke('vault:load'),
  importFolder: () => ipcRenderer.invoke('vault:import'),
  onImportRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('vault:choose-folder', listener);
    return () => ipcRenderer.removeListener('vault:choose-folder', listener);
  }
});
