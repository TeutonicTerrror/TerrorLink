const { contextBridge, ipcRenderer } = require('electron');
try {
  ipcRenderer.invoke('tray-preload-ready').catch(() => {});
} catch (e) {}
contextBridge.exposeInMainWorld('trayAPI', {
  show: () => ipcRenderer.invoke('tray-show'),
  hostStart: () => ipcRenderer.invoke('tray-host-start'),
  quit: () => ipcRenderer.invoke('tray-quit'),
  openSettings: () => ipcRenderer.invoke('tray-open-settings'),
  hideMenu: () => ipcRenderer.invoke('tray-hide-menu'),
  hostToggle: () => ipcRenderer.invoke('tray-host-toggle'),
  onState: (cb) => ipcRenderer.on('tray-state', (_e, state) => { try { cb(state); } catch (e) {} }),
  toggleWindow: () => ipcRenderer.invoke('tray-toggle-window')
});