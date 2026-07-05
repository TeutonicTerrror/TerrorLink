const { contextBridge, ipcRenderer, shell, clipboard } = require('electron');

contextBridge.exposeInMainWorld('appAPI', {
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },
  on: (channel, callback) => {
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  once: (channel, callback) => {
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.once(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  openExternal: (url) => {
    if (/^https?:\/\//i.test(String(url || ''))) {
      shell.openExternal(String(url));
    }
  },
  copyText: (text) => {
    try {
      clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }
});
