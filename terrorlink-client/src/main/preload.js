const { contextBridge, ipcRenderer, shell, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let clientPackageJson;
try {
  clientPackageJson = require('../../package.json');
} catch (e) {
  console.error('[preload] Failed to load package.json:', e && e.message);
  clientPackageJson = { version: '0.0.0' };
}

let emojiGroups;
try {
  emojiGroups = require('unicode-emoji-json/data-by-group.json');
} catch (e) {
  console.error('[preload] Failed to load emoji data:', e && e.message);
  emojiGroups = [];
}

function resolveThemeIconUrl(candidate) {
  try {
    const tryPaths = [];
    try {
      if (process && process.resourcesPath) {
        tryPaths.push(path.join(process.resourcesPath, 'app', candidate));
        tryPaths.push(path.join(process.resourcesPath, candidate));
      }
    } catch (e) {}
    tryPaths.push(path.join(__dirname || '.', candidate));
    tryPaths.push(path.join(process.cwd() || '.', candidate));
    tryPaths.push(path.join('.', candidate));

    for (const p of tryPaths) {
      try {
        if (p && fs.existsSync(p)) {
          return 'file://' + String(p).replace(/\\/g, '/');
        }
      } catch (e) {}
    }
    return null;
  } catch (e) {
    return null;
  }
}

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
  },

  sha256: (data) => crypto.createHash('sha256').update(data).digest('hex'),

  version: String((clientPackageJson && clientPackageJson.version) || '0.0.0'),

  emojiGroups: emojiGroups,

  getThemeIconUrl: resolveThemeIconUrl
});
