const { app, BrowserWindow, nativeImage, Tray, Menu, ipcMain, globalShortcut, screen, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { initAutoUpdater } = require('./updater');
const DEBUG_LOG_PATH = path.join(os.tmpdir(), 'terrorlink-host-debug.log');
let debugLoggingEnabled = false;

let TLHook = null;
let trueOverlayEnabled = false;
let trueOverlayBuffer = '';
let trueOverlayActive = false;

function loadTLHook() {
  if (TLHook) return TLHook;
  try {
    const tryPaths = [
      path.join(__dirname, '../../../TLHook'),
      path.join(process.resourcesPath || '', 'TLHook'),
      path.join(__dirname, '../../../TLHook')
    ];
    for (const p of tryPaths) {
      try {
        const indexPath = path.join(p, 'src/index.js');
        if (fs.existsSync(indexPath)) {
          TLHook = require(indexPath);
          debugWrite('TLHook loaded from: ' + sanitizePath(p));
          return TLHook;
        }
      } catch (e) {
        debugWrite('TLHook load attempt failed at ' + sanitizePath(p) + ': ' + (e && e.message));
      }
    }
  } catch (e) {
    debugWrite('TLHook load failed: ' + (e && e.message));
  }
  return null;
}

const VK_MAP = {
  8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Control', 18: 'Alt',
  20: 'CapsLock', 27: 'Escape', 32: ' ', 33: 'PageUp', 34: 'PageDown',
  35: 'End', 36: 'Home', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
  45: 'Insert', 46: 'Delete',
  48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7', 56: '8', 57: '9',
  65: 'a', 66: 'b', 67: 'c', 68: 'd', 69: 'e', 70: 'f', 71: 'g', 72: 'h', 73: 'i', 74: 'j',
  75: 'k', 76: 'l', 77: 'm', 78: 'n', 79: 'o', 80: 'p', 81: 'q', 82: 'r', 83: 's', 84: 't',
  85: 'u', 86: 'v', 87: 'w', 88: 'x', 89: 'y', 90: 'z',
  96: '0', 97: '1', 98: '2', 99: '3', 100: '4', 101: '5', 102: '6', 103: '7', 104: '8', 105: '9',
  106: '*', 107: '+', 109: '-', 110: '.', 111: '/',
  160: 'Shift', 161: 'Shift', 162: 'Control', 163: 'Control', 164: 'Alt', 165: 'Alt',
  186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`',
  219: '[', 220: '\\', 221: ']', 222: "'"
};

const SHIFT_MAP = {
  '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
  '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '`': '~'
};

let trueOverlayShiftHeld = false;
let trueOverlayCtrlHeld = false;
let trueOverlaySelectAll = false;

function debugWrite(msg) {
  try {
    const line = new Date().toISOString() + ' ' + String(msg) + '\n';
    fs.appendFileSync(DEBUG_LOG_PATH, line, { encoding: 'utf8' });
  } catch (e) {}
}

function sanitizePath(str) {
  if (!str || typeof str !== 'string') return str;
  try {
    let sanitized = str.replace(/C:\\Users\\[^\\]+/gi, 'C:\\Users\\[USER]');
    sanitized = sanitized.replace(/\/home\/[^\/]+/g, '/home/[USER]');
    sanitized = sanitized.replace(/\/Users\/[^\/]+/g, '/Users/[USER]');
    return sanitized;
  } catch (e) {
    return str;
  }
}

function sanitizeHostLog(str) {
  try {
    let sanitized = sanitizePath(String(str || ''));
    sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]');
    sanitized = sanitized.replace(/\b(?:[a-fA-F0-9]{1,4}:){2,}[a-fA-F0-9:]{1,4}\b/g, '[REDACTED_IP]');
    return sanitized;
  } catch (e) {
    return String(str || '');
  }
}

function emitHostLog(line) {
  try { sendHostEvent('host-log', sanitizeHostLog(line)); } catch (e) {}
}

try { debugWrite('main module loaded at ' + new Date().toISOString()); } catch (e) {}

try {
  if (app && app.commandLine && typeof app.commandLine.appendSwitch === 'function') {
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
    app.commandLine.appendSwitch('disable-gpu-program-cache');
  }
} catch (e) {}

try {
  if (app && typeof app.requestSingleInstanceLock === 'function') {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      try { app.quit(); } catch (e) {}
      try { process.exit(0); } catch (e) {}
    }
    app.on('second-instance', (_event, _argv, _workingDirectory) => {
      try {
        if (win) {
          try { if (win.isMinimized && win.isMinimized()) win.restore(); } catch (e) {}
          try { bringOverlayToFront(); } catch (e) {}
        }
      } catch (e) {}
    });
  }
} catch (e) {}

function sendTrayState() {
  try {
    const state = {
      windowVisible: !!(win && typeof win.isVisible === 'function' && win.isVisible()),
      hostRunning: !!(hostState && hostState.running)
    };
    if (trayMenuWindow && !trayMenuWindow.isDestroyed() && trayMenuWindow.webContents) {
      try { trayMenuWindow.webContents.send('tray-state', state); } catch (e) {}
    }
  } catch (e) {}
}
let win = null;
let rrWindow = null;
let tray = null;
let quitting = false;
let currentToggleKey = ']';
let currentFocusKey = '/';
let currentHostPanelKey = 'Control+H';
let currentHostToggleKey = 'Control+Shift+H';
let currentSettingsKey = 'Control+Shift+S';
let currentCopyInviteKey = 'Control+I';
let currentTheme = 'default';
const MIN_WINDOW_WIDTH = 420;
const MIN_WINDOW_HEIGHT = 340;
const iconPath = path.join(__dirname, '../../assets/images/icon.png');
const trayIconPath = path.join(__dirname, '../../assets/images/tray_icon.png');
let cachedIcon = null;
let cachedTrayIcon = null;
let hostState = {
  running: false,
  serverProc: null,
  cloudflaredProc: null,
  stoppingRequested: false
};

let _registerSlashShortcuts = () => {};
let _unregisterSlashShortcuts = () => {};
let _registerToggleAccelerator = () => {};
let _unregisterToggleAccelerator = () => {};

function normalizeAccelerator(accel) {
  return String(accel || '').trim().replace(/\bctrl\b/ig, 'Control').replace(/\bcmd\b/ig, 'Command').replace(/\bcommandorcontrol\b/ig, 'CommandOrControl');
}

function registerGlobalShortcut(accel, callback) {
  try {
    const normalized = normalizeAccelerator(accel);
    if (!normalized) return false;
    return globalShortcut.register(normalized, callback);
  } catch (e) {
    return false;
  }
}

function unregisterGlobalShortcut(accel) {
  try {
    const normalized = normalizeAccelerator(accel);
    if (!normalized) return;
    if (globalShortcut.isRegistered(normalized)) globalShortcut.unregister(normalized);
  } catch (e) {}
}

let devToolsShortcutsRegistered = false;

function registerDevToolsShortcuts() {
  if (devToolsShortcutsRegistered) return;
  try {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (win && win.webContents) {
        win.webContents.toggleDevTools();
      }
    });
    devToolsShortcutsRegistered = true;
    debugWrite('DevTools shortcuts registered');
  } catch (e) {
    debugWrite('Failed to register DevTools shortcuts: ' + (e && e.message));
  }
}

function unregisterDevToolsShortcuts() {
  if (!devToolsShortcutsRegistered) return;
  try {
    globalShortcut.unregister('CommandOrControl+Shift+I');
    devToolsShortcutsRegistered = false;
    debugWrite('DevTools shortcuts unregistered');
  } catch (e) {
    debugWrite('Failed to unregister DevTools shortcuts: ' + (e && e.message));
  }
}

function getThemeIconPath(theme) {
  const iconMap = {
    shockwire: 'terrorLinkicon_YellowPreset.ico',
    royalchain: 'terrorLinkicon_BlueGoldPreset.ico',
    bloodlink: 'terrorLinkicon_RedPreset.ico',
    rosepetal: 'terrorLinkicon_RosePreset.ico',
    toxicreactor: 'terrorLinkicon_ToxicReactorPreset.ico'
  };
  const filename = iconMap[theme] || 'tray_icon.png';
  const tryPaths = [
    path.join(__dirname, '../../assets/icons', filename),
    path.join(__dirname, '../../assets/images', filename),
    path.join(process.resourcesPath || '', filename),
    path.join(process.resourcesPath || '', 'app', filename)
  ];
  for (const p of tryPaths) {
    try { if (require('fs').existsSync(p)) return 'file://' + p.replace(/\\/g, '/'); } catch (e) {}
  }
  return filename;
}

function sendHostEvent(name, payload) {
  try {
    if (win && win.webContents && win.webContents.send) win.webContents.send(name, payload);
  } catch (e) {}
}
function getAppIcon() {
  if (cachedIcon) return cachedIcon;
  try {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      cachedIcon = image;
      return cachedIcon;
    }
  } catch (e) {}
  cachedIcon = nativeImage.createEmpty();
  return cachedIcon;
}

function getTrayIcon() {
  if (cachedTrayIcon) return cachedTrayIcon;
  try {
    const image = nativeImage.createFromPath(trayIconPath);
    if (!image.isEmpty()) {
      cachedTrayIcon = image;
      return cachedTrayIcon;
    }
  } catch (e) {}
  cachedTrayIcon = getAppIcon();
  return cachedTrayIcon;
}

function bringOverlayToFront(options = {}) {
  if (!win) return;
  const skipShow = !!options.skipShow;
  const skipFocus = !!options.skipFocus || trueOverlayEnabled;
  win.setAlwaysOnTop(true, 'screen-saver');
  try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (e) {}
  try { win.moveTop(); } catch (e) {}
  if (!skipShow) {
    if (skipFocus) {
      win.showInactive();
    } else {
      win.show();
    }
  }
  if (!skipFocus) {
    win.focus();
  }
  win.setSkipTaskbar(false);
}

function applyWindowSecurityPolicies(targetWindow) {
  if (!targetWindow || !targetWindow.webContents) return;
  try {
    targetWindow.webContents.setWindowOpenHandler(({ url }) => {
      try {
        if (/^https?:\/\//i.test(String(url || ''))) {
          require('electron').shell.openExternal(String(url));
        }
      } catch (e) {}
      return { action: 'deny' };
    });
  } catch (e) {}

  try {
    targetWindow.webContents.on('will-navigate', (event, url) => {
      try {
        const targetUrl = String(url || '');
        if (/^https?:\/\//i.test(targetUrl)) {
          event.preventDefault();
          try { require('electron').shell.openExternal(targetUrl); } catch (e) {}
        }
      } catch (e) {
        try { event.preventDefault(); } catch (ee) {}
      }
    });
  } catch (e) {}

  try {
    const ses = targetWindow.webContents.session;
    if (ses && typeof ses.setPermissionRequestHandler === 'function') {
      ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    }
  } catch (e) {}
}

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const maxWidth = Math.floor(screenWidth * 0.95);
  const maxHeight = Math.floor(screenHeight * 0.95);
  
  win = new BrowserWindow({
    width: 500,
    height: 340,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    maxWidth: maxWidth,
    maxHeight: maxHeight,
    transparent: true,
    frame: false,
    resizable: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      webviewTag: false,
      webSecurity: true,
      sandbox: false,
      allowRunningInsecureContent: false,
      enableRemoteModule: false
    },
    backgroundColor: '#00000000'
  });

  applyWindowSecurityPolicies(win);

  win.setMenuBarVisibility(false);
  win.removeMenu && win.removeMenu();
  win.on('enter-full-screen', () => { try { win.setFullScreen(false); } catch (e) {} });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  try { win.show(); } catch (e) {}
  win.webContents && win.webContents.on && win.webContents.on('did-finish-load', () => {
    try { debugWrite('window ready-to-show at ' + new Date().toISOString()); } catch (e) {}
    try { bringOverlayToFront(); } catch (e) {}
  });
  win.on('show', () => {
    bringOverlayToFront({ skipShow: true });
    win.webContents.send('overlay-visibility', true);
    try { sendTrayState(); } catch (e) {}
  });
  win.on('hide', () => {
    win.webContents.send('overlay-visibility', false);
    try { sendTrayState(); } catch (e) {}
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
      try { if (tray && tray.displayBalloon) tray.displayBalloon({ title: 'TerrorLink', content: 'Minimized to tray' }); } catch (e) {}
    }
  });
}

function openRrWindow(payload = {}) {
  if (rrWindow && !rrWindow.isDestroyed()) {
    try { rrWindow.focus(); } catch (e) {}
    if (rrWindow.webContents && payload && typeof payload === 'object') {
      rrWindow.webContents.send('rr-command', payload);
    }
    return;
  }

  rrWindow = new BrowserWindow({
    width: 920,
    height: 780,
    minWidth: 640,
    minHeight: 520,
    resizable: true,
    autoHideMenuBar: true,
    title: 'Russian Roulette',
    webPreferences: {
      preload: path.join(__dirname, "rr-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      webSecurity: true,
      sandbox: false,
      allowRunningInsecureContent: false,
      enableRemoteModule: false
    }
  });

  applyWindowSecurityPolicies(rrWindow);

  rrWindow.loadFile(path.join(__dirname, 'rr.html'));
  rrWindow.once('ready-to-show', () => {
    try { rrWindow.show(); } catch (e) {}
    if (payload && typeof payload === 'object') {
      rrWindow.webContents.send('rr-command', payload);
    }
  });

  rrWindow.on('close', () => { rrWindow = null; });
}

ipcMain.on('open-rr-window', (_event, payload) => {
  openRrWindow(payload);
});

ipcMain.on('rr-system-update', (_event, payload) => {
  if (!rrWindow || rrWindow.isDestroyed()) return;
  if (!payload || typeof payload.text !== 'string') return;
  rrWindow.webContents.send('rr-system-update', { text: String(payload.text) });
});

ipcMain.on('rr-action', (_event, payload) => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('rr-action', payload);
});

function createTray() {
  try {
    tray = new Tray(getTrayIcon());
  } catch (e) {
    debugWrite('createTray failed: ' + (e && (e.stack || e.message || e)));
    tray = null;
    return;
  }
  tray.setToolTip('TerrorLink');

  tray.on('click', () => {
    debugWrite('tray click event');
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
      win.setSkipTaskbar(true);
    } else {
      bringOverlayToFront();
    }
  });

  tray.on('right-click', () => {
    debugWrite('tray right-click event');
    toggleTrayMenu();
  });
}

let trayMenuWindow = null;

function createTrayMenuWindow() {
  if (trayMenuWindow) return;
  trayMenuWindow = new BrowserWindow({
    width: 300,
    height: 260,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'tray-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  trayMenuWindow.loadFile(path.join(__dirname, '../renderer/tray-menu.html'));
  trayMenuWindow.webContents && trayMenuWindow.webContents.on && trayMenuWindow.webContents.on('did-finish-load', () => {
    debugWrite('trayMenuWindow did-finish-load');
    try { trayMenuWindow.webContents.send('tray-state', { windowVisible: !!(win && win.isVisible && win.isVisible()), hostRunning: !!(hostState && hostState.running), theme: currentTheme, iconPath: getThemeIconPath(currentTheme) }); } catch (e) {}
  });

  trayMenuWindow.on('blur', () => {
    try { trayMenuWindow.hide(); } catch (e) {}
  });

  trayMenuWindow.on('close', (e) => {
    e.preventDefault();
    try { trayMenuWindow.hide(); } catch (e) {}
  });
}

function toggleTrayMenu() {
  try {
    if (trayMenuWindow && trayMenuWindow.isDestroyed && trayMenuWindow.isDestroyed()) {
      trayMenuWindow = null;
    }
    if (!trayMenuWindow) createTrayMenuWindow();
    if (!tray) return;
    if (trayMenuWindow.isVisible()) {
      trayMenuWindow.hide();
      return;
    }
    const trayBounds = tray.getBounds();
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const { workArea } = display;

    const menuWidth = 260;
    const menuHeight = 200;
    debugWrite('toggleTrayMenu called; trayBounds=' + JSON.stringify(trayBounds || {}));
    let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (menuWidth / 2));
    let y = Math.round(trayBounds.y - menuHeight - 4);
    if (y < workArea.y) y = Math.round(trayBounds.y + trayBounds.height + 8);
    const bottom = workArea.y + workArea.height;
    if (y + menuHeight > bottom) {
      y = Math.max(workArea.y + 8, bottom - menuHeight - 8);
    }

    trayMenuWindow.setPosition(x, y, false);
    try {
      try { trayMenuWindow.setAlwaysOnTop(true, 'pop-up-menu'); } catch (e) {}
      if (typeof trayMenuWindow.showInactive === 'function') {
        trayMenuWindow.showInactive();
      } else {
        trayMenuWindow.show();
      }
      try { trayMenuWindow.focus(); } catch (e) {}
      debugWrite('toggleTrayMenu shown at x=' + x + ' y=' + y);
      try { sendTrayState(); } catch (e) {}
    } catch (showErr) {
      debugWrite('toggleTrayMenu show error: ' + (showErr && (showErr.stack || showErr.message || showErr)));
    }
  } catch (e) {
    debugWrite('toggleTrayMenu error: ' + (e && (e.stack || e.message || e)));
  }
}

ipcMain.on('minimize-to-tray', () => {
  if (win) {
    win.hide();
    win.setSkipTaskbar(true);
  }
});

ipcMain.on('set-theme', (_ev, theme) => {
  currentTheme = theme || 'default';
  if (trayMenuWindow && !trayMenuWindow.isDestroyed() && trayMenuWindow.webContents) {
    try { trayMenuWindow.webContents.send('tray-state', { theme: currentTheme, iconPath: getThemeIconPath(currentTheme) }); } catch (e) {}
  }
});

ipcMain.on('toggle-window', () => {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    if (trueOverlayEnabled) {
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    } else {
      bringOverlayToFront();
    }
  }
});

ipcMain.on('show-from-tray', () => {
  if (win) {
    if (trueOverlayEnabled) {
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    } else {
      bringOverlayToFront();
    }
  }
});

ipcMain.handle('tray-show', () => {
  debugWrite('ipc: tray-show invoked');
  if (win) {
    if (trueOverlayEnabled) {
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    } else {
      bringOverlayToFront();
    }
  }
});

ipcMain.handle('tray-host-start', () => {
  debugWrite('ipc: tray-host-start invoked');
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send('trigger-host-start');
    }
  } catch (e) { debugWrite('ipc tray-host-start failed: ' + (e && e.message)); }
});

ipcMain.handle('tray-host-stop', () => {
  debugWrite('ipc: tray-host-stop invoked');
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send('trigger-host-stop');
    }
  } catch (e) { debugWrite('ipc tray-host-stop failed: ' + (e && e.message)); }
});

ipcMain.handle('tray-quit', () => {
  debugWrite('ipc: tray-quit invoked');
  quitting = true;
  try {
    try { ipcMain.emit('host-stop'); } catch (e) { debugWrite('host-stop emit failed during quit: ' + (e && e.message)); }
    try { if (trayMenuWindow && !trayMenuWindow.isDestroyed()) trayMenuWindow.hide(); } catch (e) {}
    try { if (tray) { try { tray.destroy(); } catch (ee) { debugWrite('tray.destroy failed: ' + (ee && ee.message)); } tray = null; } } catch (e) {}
    try { if (win && !win.isDestroyed()) { win.removeAllListeners('close'); win.close(); } } catch (e) { debugWrite('window close failed: ' + (e && e.message)); }
    try { app.quit(); debugWrite('app.quit called from tray-quit'); } catch (e) { debugWrite('app.quit error: ' + (e && e.message)); }
    setTimeout(() => {
      try { debugWrite('quit fallback: process.exit(0)'); process.exit(0); } catch (e) { try { debugWrite('process.exit fallback failed: ' + (e && e.message)); } catch (ee) {} }
    }, 1000);
  } catch (e) { debugWrite('tray-quit handler error: ' + (e && e.message)); }
});

ipcMain.handle('tray-open-settings', () => {
  debugWrite('ipc: tray-open-settings invoked');
  try {
    if (win && win.webContents && win.webContents.send) {
      win.webContents.send('open-settings');
      bringOverlayToFront();
    }
  } catch (e) { debugWrite('ipc tray-open-settings failed: ' + (e && e.message)); }
});

ipcMain.handle('tray-hide-menu', () => {
  debugWrite('ipc: tray-hide-menu invoked');
  try {
    if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
      trayMenuWindow.hide();
      return true;
    }
    debugWrite('tray-hide-menu: trayMenuWindow not available');
  } catch (e) { debugWrite('ipc tray-hide-menu failed: ' + (e && e.message)); }
  return false;
});

ipcMain.handle('tray-host-toggle', () => {
  debugWrite('ipc: tray-host-toggle invoked');
  try {
    if (hostState && hostState.running) {
      try { ipcMain.emit('host-stop'); } catch (e) { debugWrite('emit host-stop failed: ' + (e && e.message)); }
    } else {
      try { ipcMain.emit('host-start', { /* synthetic */ }); } catch (e) { debugWrite('emit host-start failed: ' + (e && e.message)); }
    }
    try { setTimeout(sendTrayState, 200); } catch (e) {}
    return true;
  } catch (e) { debugWrite('ipc tray-host-toggle failed: ' + (e && e.message)); return false; }
});

ipcMain.on('resize-window', (_event, size = {}) => {
  if (!win) return;
  const requestedWidth = Number(size.width) || MIN_WINDOW_WIDTH;
  const requestedHeight = Number(size.height) || MIN_WINDOW_HEIGHT;
  const width = Math.max(MIN_WINDOW_WIDTH, Math.floor(requestedWidth));
  const height = Math.max(MIN_WINDOW_HEIGHT, Math.floor(requestedHeight));
  try {
    const [currentWidth, currentHeight] = win.getSize();
    if (currentWidth === width && currentHeight === height) return;
    win.setSize(width, height, false);
  } catch (e) {}
});

ipcMain.on('true-overlay-enable', () => {
  if (trueOverlayEnabled) return;
  const hook = loadTLHook();
  if (!hook) {
    debugWrite('true-overlay-enable: TLHook not available');
    if (win && win.webContents) win.webContents.send('true-overlay-status', { enabled: false, error: 'TLHook not available' });
    return;
  }
  try {
    _unregisterSlashShortcuts();
    _unregisterToggleAccelerator();
    debugWrite('true-overlay-enable: global shortcuts unregistered');
    
    const started = hook.startHook((eventCode) => {
      if (!trueOverlayEnabled || !win || win.isDestroyed()) return;
      
      const isKeyUp = (eventCode & 0x80000000) !== 0;
      const vkCode = eventCode & 0x7FFFFFFF;
      const key = VK_MAP[vkCode] || '';
      
      if (!key) return;
      
      if (key === 'Shift') {
        trueOverlayShiftHeld = !isKeyUp;
        return;
      }
      if (key === 'Control') {
        trueOverlayCtrlHeld = !isKeyUp;
        return;
      }
      
      if (isKeyUp) return;
      
      const focusMatch = key.toLowerCase() === currentFocusKey.toLowerCase();
      const toggleMatch = key.toLowerCase() === currentToggleKey.toLowerCase();
      
      if (key === 'Escape' || (trueOverlayActive && focusMatch)) {
        trueOverlayActive = false;
        trueOverlayBuffer = '';
        trueOverlayShiftHeld = false;
        trueOverlayCtrlHeld = false;
        win.webContents.send('true-overlay-deactivate');
        return;
      }
      
      if (toggleMatch) {
        if (win.isVisible()) {
          trueOverlayActive = false;
          trueOverlayBuffer = '';
          trueOverlayShiftHeld = false;
          trueOverlayCtrlHeld = false;
          win.webContents.send('true-overlay-deactivate');
          win.hide();
        } else {
          win.showInactive();
          win.setAlwaysOnTop(true, 'screen-saver');
        }
        return;
      }
      
      if (!trueOverlayActive) {
        if (focusMatch) {
          if (!win.isVisible()) {
            win.showInactive();
            win.setAlwaysOnTop(true, 'screen-saver');
          }
          trueOverlayActive = true;
          trueOverlayBuffer = '';
          trueOverlaySelectAll = false;
          win.webContents.send('true-overlay-activate');
        }
        return;
      }
      
      if (trueOverlayCtrlHeld && key.toLowerCase() === 'v') {
        try {
          const { clipboard } = require('electron');
          const clipText = clipboard.readText() || '';
          if (trueOverlaySelectAll) {
            trueOverlayBuffer = clipText;
            trueOverlaySelectAll = false;
          } else {
            trueOverlayBuffer += clipText;
          }
          win.webContents.send('true-overlay-buffer', trueOverlayBuffer);
        } catch (e) {}
        return;
      }
      
      if (trueOverlayCtrlHeld && key.toLowerCase() === 'a') {
        trueOverlaySelectAll = true;
        win.webContents.send('true-overlay-selectall');
        return;
      }
      
      if (trueOverlaySelectAll && key.length === 1) {
        trueOverlayBuffer = '';
        trueOverlaySelectAll = false;
      }
      
      if (key === 'Enter') {
        if (trueOverlayBuffer.trim()) {
          win.webContents.send('true-overlay-send', trueOverlayBuffer);
        }
        trueOverlayBuffer = '';
        trueOverlayActive = false;
        win.webContents.send('true-overlay-deactivate');
        return;
      }
      
      if (key === 'Backspace') {
        if (trueOverlaySelectAll) {
          trueOverlayBuffer = '';
          trueOverlaySelectAll = false;
        } else {
          trueOverlayBuffer = trueOverlayBuffer.slice(0, -1);
        }
        win.webContents.send('true-overlay-buffer', trueOverlayBuffer);
        return;
      }
      
      if (key.length === 1) {
        let char = key;
        if (trueOverlayShiftHeld) {
          if (SHIFT_MAP[key]) {
            char = SHIFT_MAP[key];
          } else if (/^[a-z]$/.test(key)) {
            char = key.toUpperCase();
          }
        }
        trueOverlayBuffer += char;
        win.webContents.send('true-overlay-buffer', trueOverlayBuffer);
        return;
      }
    });
    
    if (started) {
      trueOverlayEnabled = true;
      debugWrite('true-overlay-enable: hook started successfully');
      if (win && win.webContents) win.webContents.send('true-overlay-status', { enabled: true });
    } else {
      debugWrite('true-overlay-enable: hook failed to start');
      if (win && win.webContents) win.webContents.send('true-overlay-status', { enabled: false, error: 'Hook failed to start' });
    }
  } catch (e) {
    debugWrite('true-overlay-enable error: ' + (e && e.message));
    if (win && win.webContents) win.webContents.send('true-overlay-status', { enabled: false, error: e && e.message });
  }
});

ipcMain.on('true-overlay-disable', () => {
  if (!trueOverlayEnabled) return;
  try {
    const hook = loadTLHook();
    if (hook) hook.stopHook();
    trueOverlayEnabled = false;
    trueOverlayActive = false;
    trueOverlayBuffer = '';
    trueOverlayShiftHeld = false;
    trueOverlayCtrlHeld = false;
    debugWrite('true-overlay-disable: hook stopped');
    
    _registerSlashShortcuts();
    _registerToggleAccelerator(currentToggleKey);
    debugWrite('true-overlay-disable: global shortcuts re-registered');
    
    if (win && win.webContents) {
      win.webContents.send('true-overlay-deactivate');
      win.webContents.send('true-overlay-status', { enabled: false });
    }
  } catch (e) {
    debugWrite('true-overlay-disable error: ' + (e && e.message));
  }
});

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    try { app.setAppUserModelId('com.teutonicterror.terrorlink'); } catch (e) {}
  }

  try {
    const ytFilter = { urls: ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*', 'https://*.googlevideo.com/*', 'https://*.google.com/*'] };
    const ytSpoofHeaders = (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.youtube.com/';
      details.requestHeaders['Origin'] = 'https://www.youtube.com';
      callback({ requestHeaders: details.requestHeaders });
    };
    const ytStripFrameHeaders = (details, callback) => {
      const headers = details.responseHeaders || {};
      delete headers['x-frame-options'];
      delete headers['X-Frame-Options'];
      Object.keys(headers).forEach(k => {
        if (k.toLowerCase() === 'x-frame-options') delete headers[k];
      });
      callback({ responseHeaders: headers });
    };
    session.defaultSession.webRequest.onBeforeSendHeaders(ytFilter, ytSpoofHeaders);
    session.defaultSession.webRequest.onHeadersReceived(ytFilter, ytStripFrameHeaders);
    const ytSession = session.fromPartition('persist:youtube');
    ytSession.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    ytSession.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, ytSpoofHeaders);
    ytSession.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, ytStripFrameHeaders);
  } catch (e) {}

  const isDev = !app.isPackaged;
  if (isDev) {
    createWindow();
    try { debugWrite('app.whenReady: createWindow invoked at ' + new Date().toISOString()); } catch (e) {}
    registerIPCHandlers();
    try { setImmediate(() => { try { createTray(); } catch (e) { debugWrite('createTray deferred failed: ' + (e && e.message)); } }); } catch (e) { try { createTray(); } catch (ee) { debugWrite('createTray fallback failed: ' + (ee && ee.message)); } }
  } else {
    try {
      initAutoUpdater(() => {
        createWindow();
        try { debugWrite('app.whenReady: createWindow invoked at ' + new Date().toISOString()); } catch (e) {}
        registerIPCHandlers();
        
        try { setImmediate(() => { try { createTray(); } catch (e) { debugWrite('createTray deferred failed: ' + (e && e.message)); } }); } catch (e) { try { createTray(); } catch (ee) { debugWrite('createTray fallback failed: ' + (ee && ee.message)); } }
      });
    } catch (e) {
      debugWrite('initAutoUpdater failed: ' + (e && e.message));
      createWindow();
      try { debugWrite('app.whenReady: createWindow invoked at ' + new Date().toISOString()); } catch (e) {}
      registerIPCHandlers();
      try { setImmediate(() => { try { createTray(); } catch (e) { debugWrite('createTray deferred failed: ' + (e && e.message)); } }); } catch (e) { try { createTray(); } catch (ee) { debugWrite('createTray fallback failed: ' + (ee && ee.message)); } }
    }
  }


  try {
    let _toggleFocusHandler = null;
    let _toggleBlurHandler = null;

    function registerToggleAccelerator(accel) {
      try {
        unregisterToggleAccelerator();
        if (!accel) return false;
        const isSimple = String(accel || '').indexOf('+') === -1;
        if (isSimple && win) {
          _toggleBlurHandler = () => {
            try {
              if (!globalShortcut.isRegistered(accel)) {
                globalShortcut.register(accel, () => {
                  try { if (!win) return; if (win.isVisible()) win.hide(); else bringOverlayToFront(); } catch (e) {}
                });
              }
            } catch (e) {}
          };
          _toggleFocusHandler = () => {
            try { if (globalShortcut.isRegistered(accel)) globalShortcut.unregister(accel); } catch (e) {}
          };
          try { win.on('blur', _toggleBlurHandler); } catch (e) {}
          try { win.on('focus', _toggleFocusHandler); } catch (e) {}
          try { if (!win.isFocused()) _toggleBlurHandler(); } catch (e) {}
          return true;
        }

        const ok = globalShortcut.register(accel, () => {
          try { if (!win) return; if (win.isVisible()) win.hide(); else bringOverlayToFront(); } catch (e) {}
        });
        return ok;
      } catch (e) { return false; }
    }

    function unregisterToggleAccelerator() {
      try {
        if (_toggleBlurHandler && win) {
          try { win.removeListener('blur', _toggleBlurHandler); } catch (e) {}
          _toggleBlurHandler = null;
        }
      } catch (e) {}
      try {
        if (_toggleFocusHandler && win) {
          try { win.removeListener('focus', _toggleFocusHandler); } catch (e) {}
          _toggleFocusHandler = null;
        }
      } catch (e) {}
      unregisterGlobalShortcut(currentToggleKey);
      unregisterGlobalShortcut(`Control+${currentToggleKey}`);
    }

    _registerToggleAccelerator = registerToggleAccelerator;
    _unregisterToggleAccelerator = unregisterToggleAccelerator;

    registerToggleAccelerator(currentToggleKey);
  } catch (e) {
    console.warn('globalShortcut register failed:', e && e.message);
  }

  function registerSlashShortcuts() {
    try {
      if (!currentFocusKey) return;
      if (!win) return;
      if (globalShortcut.isRegistered('/')) return;
      if (win && win.isFocused && win.isFocused()) return;
      const ok = globalShortcut.register(currentFocusKey, () => {
        if (!win) return;
        try {
          if (!win.isVisible()) return;
          if (!win.isFocused()) bringOverlayToFront();
          win.webContents && win.webContents.send && win.webContents.send('focus-chat');
        } catch (e) {}
      });
      if (!ok) {
        try {
          if (!globalShortcut.isRegistered(`Control+${currentFocusKey}`)) {
            globalShortcut.register(`Control+${currentFocusKey}`, () => {
              if (!win) return;
              try {
                if (!win.isVisible()) return;
                if (!win.isFocused()) bringOverlayToFront();
                win.webContents && win.webContents.send && win.webContents.send('focus-chat');
              } catch (e) {}
            });
          }
        } catch (e) {}
      }
    } catch (e) {}
  }


  function unregisterSlashShortcuts() {
    try {
      unregisterGlobalShortcut(currentFocusKey);
    } catch (e) {}
    try {
      unregisterGlobalShortcut(`Control+${currentFocusKey}`);
    } catch (e) {}
  }

  function registerRendererShortcut(accel, callback) {
    try {
      unregisterGlobalShortcut(accel);
      return registerGlobalShortcut(accel, callback);
    } catch (e) {
      return false;
    }
  }

  function registerHostPanelShortcut(accel) {
    return registerRendererShortcut(accel, () => {
      try {
        if (!win || !win.webContents) return;
        win.webContents.send('toggle-host-panel');
      } catch (e) {}
    });
  }

  function unregisterHostPanelShortcut(accel) {
    unregisterGlobalShortcut(accel);
  }

  function registerHostToggleShortcut(accel) {
    return registerRendererShortcut(accel, () => {
      try {
        if (!win || !win.webContents) return;
        win.webContents.send('toggle-host-server-shortcut');
      } catch (e) {}
    });
  }

  function unregisterHostToggleShortcut(accel) {
    unregisterGlobalShortcut(accel);
  }

  function registerSettingsShortcut(accel) {
    return registerRendererShortcut(accel, () => {
      try {
        if (!win || !win.webContents) return;
        win.webContents.send('open-settings');
        bringOverlayToFront();
      } catch (e) {}
    });
  }

  function unregisterSettingsShortcut(accel) {
    unregisterGlobalShortcut(accel);
  }

  function registerRefreshShortcut(accel) {
    return false;
  }

  function unregisterRefreshShortcut(accel) {
    return;
  }

  function registerCopyInviteShortcut(accel) {
    return registerRendererShortcut(accel, () => {
      try {
        if (!win || !win.webContents) return;
        win.webContents.send('copy-host-invite');
      } catch (e) {}
    });
  }

  function unregisterCopyInviteShortcut(accel) {
    unregisterGlobalShortcut(accel);
  }

  try { registerHostPanelShortcut(currentHostPanelKey); } catch (e) {}
  try { registerHostToggleShortcut(currentHostToggleKey); } catch (e) {}
  try { registerSettingsShortcut(currentSettingsKey); } catch (e) {}
  try { registerCopyInviteShortcut(currentCopyInviteKey); } catch (e) {}

  _registerSlashShortcuts = registerSlashShortcuts;
  _unregisterSlashShortcuts = unregisterSlashShortcuts;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      registerIPCHandlers();
    }
    else {
      win.show();
      win.focus();
    }
  });

  function registerIPCHandlers() {
    if (!win) {
      debugWrite('registerIPCHandlers: win is null, cannot register');
      return;
    }
    debugWrite('registerIPCHandlers: starting registration');

    ipcMain.on('open-youtube-player', (_ev, videoId) => {
      if (!videoId || typeof videoId !== 'string') return;
      const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeId) return;
      require('electron').shell.openExternal(`https://www.youtube.com/watch?v=${safeId}`);
    });

  if (win) {
    if (win.isVisible && win.isVisible()) registerSlashShortcuts();
    win.on('show', () => registerSlashShortcuts());
    win.on('hide', () => unregisterSlashShortcuts());
    win.on('focus', () => {
      try { unregisterSlashShortcuts(); } catch (e) {}
    });
    win.on('blur', () => {
      try { if (win.isVisible && win.isVisible()) registerSlashShortcuts(); } catch (e) {}
    });

    ipcMain.on('update-keybinds', (_ev, newBindings = {}) => {
      try {
        const prevHostPanel = currentHostPanelKey;
        const prevHostToggle = currentHostToggleKey;
        const prevSettings = currentSettingsKey;
        const prevCopyInvite = currentCopyInviteKey;
        const nextFocus = (newBindings.focusKey != null ? newBindings.focusKey : currentFocusKey) + '';
        const nextToggle = (newBindings.toggleKey != null ? newBindings.toggleKey : currentToggleKey) + '';
        const nextHostPanel = (newBindings.hostPanelKey != null ? newBindings.hostPanelKey : currentHostPanelKey) + '';
        const nextHostToggle = (newBindings.hostToggleKey != null ? newBindings.hostToggleKey : currentHostToggleKey) + '';
        const nextSettings = (newBindings.settingsKey != null ? newBindings.settingsKey : currentSettingsKey) + '';
        const nextCopyInvite = (newBindings.copyInviteKey != null ? newBindings.copyInviteKey : currentCopyInviteKey) + '';

        currentToggleKey = nextToggle;
        try { unregisterToggleAccelerator(); } catch (e) {}
        try { registerToggleAccelerator(currentToggleKey); } catch (e) {}

        currentFocusKey = nextFocus;
        try { unregisterSlashShortcuts(); } catch (e) {}
        try { if (win && win.isVisible && win.isVisible()) registerSlashShortcuts(); } catch (e) {}

        currentHostPanelKey = nextHostPanel;
        try { unregisterHostPanelShortcut(prevHostPanel); } catch (e) {}
        try { registerHostPanelShortcut(currentHostPanelKey); } catch (e) {}

        currentHostToggleKey = nextHostToggle;
        try { unregisterHostToggleShortcut(prevHostToggle); } catch (e) {}
        try { registerHostToggleShortcut(currentHostToggleKey); } catch (e) {}

        currentSettingsKey = nextSettings;
        try { unregisterSettingsShortcut(prevSettings); } catch (e) {}
        try { registerSettingsShortcut(currentSettingsKey); } catch (e) {}

        currentCopyInviteKey = nextCopyInvite;
        try { unregisterCopyInviteShortcut(prevCopyInvite); } catch (e) {}
        try { registerCopyInviteShortcut(currentCopyInviteKey); } catch (e) {}
      } catch (e) {}
    });

    ipcMain.on('host-start', async (_ev, options = {}) => {
      try {
        hostState.stoppingRequested = false;
        const requestedTunnel = String((options && options.forceTunnel) || '').trim().toLowerCase();
        const forceLocalTunnel = !!(options && options.forceLocalTunnel) || requestedTunnel === 'localtunnel';
        const forceCloudflared = requestedTunnel === 'cloudflared';
        const serverAlive = !!(hostState.serverProc && hostState.serverProc.pid && !hostState.serverProc.killed);
        const tunnelAlive = !!(hostState.cloudflaredProc && hostState.cloudflaredProc.pid && !hostState.cloudflaredProc.killed);
        if (!serverAlive) hostState.serverProc = null;
        if (!tunnelAlive) hostState.cloudflaredProc = null;
        hostState.running = !!(serverAlive || tunnelAlive);
        if (hostState.running) return sendHostEvent('host-status', { status: 'already running', running: true });

        const candidates = [];
        try {
          candidates.push(path.join(__dirname, '../../terrorlink-server', 'src/server.js'));
          candidates.push(path.join(__dirname, '../../../terrorlink-server', 'src/server.js'));
          if (process && process.resourcesPath) {
            candidates.push(path.join(process.resourcesPath, 'app', 'terrorlink-server', 'src/server.js'));
            candidates.push(path.join(process.resourcesPath, 'terrorlink-server', 'src/server.js'));
            candidates.push(path.join(process.resourcesPath, 'app', 'terrorlink-server', 'server.ncc.js'));
            candidates.push(path.join(process.resourcesPath, 'app', 'terrorlink-server', 'server.bundle.js'));
            candidates.push(path.join(process.resourcesPath, 'terrorlink-server', 'server.ncc.js'));
            candidates.push(path.join(process.resourcesPath, 'terrorlink-server', 'server.bundle.js'));
          }
          if (app && typeof app.getAppPath === 'function') {
            const appPath = app.getAppPath();
            candidates.push(path.join(appPath, 'terrorlink-server', 'src/server.js'));
            candidates.push(path.join(appPath, 'terrorlink-server', 'server.ncc.js'));
            candidates.push(path.join(appPath, 'terrorlink-server', 'server.bundle.js'));
          }
          candidates.push(path.join(__dirname, '../../terrorlink-server', 'server.ncc.js'));
          candidates.push(path.join(__dirname, '../../terrorlink-server', 'server.bundle.js'));
          candidates.push(path.join(__dirname, '../../../terrorlink-server', 'server.ncc.js'));
          candidates.push(path.join(__dirname, '../../../terrorlink-server', 'server.bundle.js'));
        } catch (e) {
        }

        let serverScript = null;
        let serverDir = null;
        let bundledServerScript = null;
        let bundledServerDir = null;
        let fallbackServerScript = null;
        let fallbackServerDir = null;
        const tried = [];
        for (const c of candidates) {
          if (!c) continue;
          tried.push(c);
          try {
            if (fs.existsSync(c)) {
              const candidateDir = path.dirname(c);
              const depRoot = path.join(candidateDir, 'node_modules');
              const isBundledCandidate = /server\.(?:bundle|ncc)\.js$/i.test(c);
              const hasDeps = fs.existsSync(path.join(depRoot, 'express'))
                && fs.existsSync(path.join(depRoot, 'ws'))
                && fs.existsSync(path.join(depRoot, 'cors'));
              if (hasDeps) {
                serverScript = c;
                serverDir = candidateDir;
                break;
              }
              if (isBundledCandidate && !bundledServerScript) {
                bundledServerScript = c;
                bundledServerDir = candidateDir;
              }
              if (!fallbackServerScript) {
                fallbackServerScript = c;
                fallbackServerDir = candidateDir;
              }
            }
          } catch (e) {
          }
        }

        if (!serverScript && bundledServerScript) {
          serverScript = bundledServerScript;
          serverDir = bundledServerDir;
        }

        if (!serverScript && fallbackServerScript) {
          serverScript = fallbackServerScript;
          serverDir = fallbackServerDir;
        }

        debugWrite('Tried server candidate paths:\n' + tried.slice(0,50).join('\n'));
        debugWrite('Selected serverScript=' + String(serverScript) + ' serverDir=' + String(serverDir));

        try {
          if (serverDir) {
            const exists = fs.existsSync(serverDir);
            debugWrite('Diagnostic: serverDir exists=' + exists + ' => ' + String(serverDir));
            if (exists) {
              try {
                const items = fs.readdirSync(serverDir);
                debugWrite('Diagnostic: serverDir listing (first 50):\n' + items.slice(0,50).join('\n'));
              } catch (e) {
                debugWrite('Diagnostic: readdirSync failed: ' + (e && e.message));
              }
              const nm = path.join(serverDir, 'node_modules');
              const hasNm = fs.existsSync(nm);
              debugWrite('Diagnostic: node_modules exists=' + hasNm + ' => ' + String(nm));
              if (hasNm) {
                const exp = path.join(nm, 'express');
                debugWrite('Diagnostic: express path exists=' + fs.existsSync(exp) + ' => ' + String(exp));
              }
            }
          }
        } catch (e) { debugWrite('Diagnostic logging error: ' + (e && e.message)); }

        try {
          if (serverDir) {
            const serverPkgPath = path.join(serverDir, 'package.json');
            if (fs.existsSync(serverPkgPath)) {
              const pkgRaw = fs.readFileSync(serverPkgPath, 'utf8');
              const pkg = JSON.parse(pkgRaw || '{}');
              const v = String((pkg && pkg.version) || '').trim();
              sendHostEvent('host-server-version', v || 'unknown');
            } else {
              sendHostEvent('host-server-version', 'unknown');
            }
          }
        } catch (e) {
          sendHostEvent('host-server-version', 'unknown');
        }

        if (!serverScript) {
          sendHostEvent('host-error', `server.js not found. Tried paths:\n${tried.slice(0,50).join('\n')}`);
          return sendHostEvent('host-status', { status: 'error: server.js missing', running: false });
        }

        const parentDir = path.join(__dirname, '..');
        const cfCandidates = [];
        try {
          cfCandidates.push(path.join(__dirname, '../../assets/cloudflared-windows-amd64.exe'));
          cfCandidates.push(path.join(__dirname, '../../../cloudflared-windows-amd64.exe'));
          if (process && process.resourcesPath) {
            cfCandidates.push(path.join(process.resourcesPath, 'app', 'cloudflared-windows-amd64.exe'));
            cfCandidates.push(path.join(process.resourcesPath, 'cloudflared-windows-amd64.exe'));
          }
          if (app && typeof app.getAppPath === 'function') {
            const appPath = app.getAppPath();
            cfCandidates.push(path.join(appPath, 'cloudflared-windows-amd64.exe'));
          }
        } catch (e) {}

        let cfPath = null;
        const cfTried = [];
        for (const c of cfCandidates) {
          if (!c) continue;
          cfTried.push(c);
          try { if (fs.existsSync(c)) { cfPath = c; break; } } catch (e) {}
        }

        const ltCandidates = [];
        const ltScriptCandidates = [];
        try {
          ltCandidates.push(path.join(__dirname, 'node_modules', '.bin', 'lt.cmd'));
          ltCandidates.push(path.join(__dirname, '..', 'node_modules', '.bin', 'lt.cmd'));
          ltCandidates.push(path.join(parentDir, 'node_modules', '.bin', 'lt.cmd'));
          ltCandidates.push(path.join(__dirname, 'resources', 'app', 'node_modules', '.bin', 'lt.cmd'));
          ltCandidates.push(path.join(__dirname, 'resources', 'node_modules', '.bin', 'lt.cmd'));
          ltScriptCandidates.push(path.join(__dirname, 'node_modules', 'localtunnel', 'bin', 'lt.js'));
          ltScriptCandidates.push(path.join(__dirname, '..', 'node_modules', 'localtunnel', 'bin', 'lt.js'));
          ltScriptCandidates.push(path.join(parentDir, 'node_modules', 'localtunnel', 'bin', 'lt.js'));
          ltScriptCandidates.push(path.join(__dirname, 'resources', 'app', 'node_modules', 'localtunnel', 'bin', 'lt.js'));
          ltScriptCandidates.push(path.join(__dirname, 'resources', 'node_modules', 'localtunnel', 'bin', 'lt.js'));
          if (process && process.resourcesPath) {
            ltCandidates.push(path.join(process.resourcesPath, 'app', 'node_modules', '.bin', 'lt.cmd'));
            ltCandidates.push(path.join(process.resourcesPath, 'node_modules', '.bin', 'lt.cmd'));
            ltScriptCandidates.push(path.join(process.resourcesPath, 'app', 'node_modules', 'localtunnel', 'bin', 'lt.js'));
            ltScriptCandidates.push(path.join(process.resourcesPath, 'node_modules', 'localtunnel', 'bin', 'lt.js'));
          }
          if (app && typeof app.getAppPath === 'function') {
            const appPath = app.getAppPath();
            ltCandidates.push(path.join(appPath, 'node_modules', '.bin', 'lt.cmd'));
            ltScriptCandidates.push(path.join(appPath, 'node_modules', 'localtunnel', 'bin', 'lt.js'));
          }
        } catch (e) {}

        let ltScriptPath = null;
        const ltScriptTried = [];
        for (const c of ltScriptCandidates) {
          if (!c) continue;
          ltScriptTried.push(c);
          try { if (fs.existsSync(c)) { ltScriptPath = c; break; } } catch (e) {}
        }
        if (!ltScriptPath) {
          try {
            const resolvedLtScript = require.resolve('localtunnel/bin/lt.js');
            if (resolvedLtScript && fs.existsSync(resolvedLtScript)) ltScriptPath = resolvedLtScript;
          } catch (e) {}
        }

        let ltPath = null;
        const ltTried = [];
        for (const c of ltCandidates) {
          if (!c) continue;
          ltTried.push(c);
          try { if (fs.existsSync(c)) { ltPath = c; break; } } catch (e) {}
        }

        if (!cfPath && !ltPath && !ltScriptPath) {
          sendHostEvent('host-error', sanitizePath(`No tunnel provider bundled. Cloudflared paths tried:\n${cfTried.slice(0,50).join('\n')}\n\nLocalTunnel script paths tried:\n${ltScriptTried.slice(0,50).join('\n')}\n\nLocalTunnel binary paths tried:\n${ltTried.slice(0,50).join('\n')}`));
          return sendHostEvent('host-status', { status: 'error: no tunnel provider available', running: false });
        }

        const { fork } = require('child_process');
        emitHostLog(`[host] Server bundle in use: ${serverScript}`);
        debugWrite('About to launch server. process.execPath=' + process.execPath + ' node version=' + process.version);
        try {
          const s = fs.statSync(serverScript);
          debugWrite('serverScript stat: size=' + s.size + ' mode=' + (s.mode || '') + ' mtime=' + s.mtime);
        } catch (e) { debugWrite('stat serverScript failed: ' + (e && e.message)); }
        try {
          fs.accessSync(serverScript, fs.constants.R_OK);
          debugWrite('serverScript is readable');
        } catch (e) { debugWrite('serverScript access check failed: ' + (e && e.message)); }
        let serverProc = null;
        try {
          if (serverScript && serverDir) {
            try {
              serverProc = fork(serverScript, [], { cwd: serverDir, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
              debugWrite('fork() returned, pid=' + (serverProc && serverProc.pid));
              try { debugWrite('serverProc.spawnfile=' + serverProc.spawnfile); } catch (e) {}
            } catch (innerErr) {
              debugWrite('fork() threw: ' + (innerErr && innerErr.stack || innerErr));
              try {
                const os2 = require('os');
                const tmpdir = os2.tmpdir();
                const tmpName = `terrorlink-server-${Date.now()}.js`;
                const tmpPath = path.join(tmpdir, tmpName);
                const scriptContents = fs.readFileSync(serverScript);
                fs.writeFileSync(tmpPath, scriptContents, { mode: 0o600 });
                debugWrite('Wrote temp server script to: ' + tmpPath + ' size=' + scriptContents.length);
                try {
                  serverProc = fork(tmpPath, [], { cwd: path.dirname(tmpPath), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
                } catch (forkTempErr) {
                  debugWrite('fork(temp) threw: ' + (forkTempErr && forkTempErr.stack || forkTempErr));
                  throw forkTempErr || innerErr;
                }
                serverProc._tempServerPath = tmpPath;
              } catch (tempErr) {
                debugWrite('temp copy/fork failed: ' + (tempErr && tempErr.stack || tempErr));
                throw tempErr || innerErr;
              }
            }
          } else {
            sendHostEvent('host-error', `server script not found in candidates.`);
            return sendHostEvent('host-status', { status: 'error: server.js missing', running: false });
          }
        } catch (err) {
          emitHostLog(`[error] Server spawn error: ${err && err.message}`);
          hostState.serverProc = null;
          hostState.running = !!(hostState.serverProc || hostState.cloudflaredProc);
          return sendHostEvent('host-status', { status: 'error: failed to spawn server', running: !!hostState.running });
        }
        serverProc.on('error', (err) => {
          debugWrite('serverProc error: ' + (err && (err.stack || err.message || err)));
          emitHostLog(`[error] Server spawn error: ${err && err.message}`);
          hostState.serverProc = null;
          hostState.running = !!(hostState.serverProc || hostState.cloudflaredProc);
          sendHostEvent('host-status', { status: 'error: failed to spawn server', running: !!hostState.running });
        });

        serverProc.on('message', (msg) => {
          try {
            if (msg && msg.type === 'host-users') {
              sendHostEvent('host-users', msg.users || []);
            }
          } catch (e) {}
        });

        hostState.serverProc = serverProc;
        hostState.running = true;
        sendHostEvent('host-status', { status: 'starting server', running: true });
        try { sendTrayState(); } catch (e) {}
        serverProc.once('spawn', () => {
          debugWrite('serverProc spawn event fired pid=' + (serverProc.pid || 'unknown'));
        });

        serverProc.stdout && serverProc.stdout.on('data', (buf) => {
          const txt = String(buf.toString());
          debugWrite('server stdout: ' + txt.trim());
          if (/listening on http:\/\/127\.0\.0\.1:\d+/i.test(txt)) {
            sendHostEvent('host-status', { status: 'server ready', running: true });
            try {
              if (hostState.cloudflaredProc) return;
              let announcedWss = '';
              let fallbackAttempted = false;

              const stopServerForTunnelFailure = () => {
                if (!hostState.serverProc) return;
                try {
                  if (hostState.serverProc.pid) {
                    const tk = spawn('taskkill', ['/PID', String(hostState.serverProc.pid), '/T', '/F'], { windowsHide: true });
                    tk.on('close', () => {});
                  } else if (typeof hostState.serverProc.kill === 'function') {
                    hostState.serverProc.kill();
                  }
                } catch (e) {}
                hostState.serverProc = null;
                hostState.running = false;
                sendHostEvent('host-share', '');
                sendHostEvent('host-status', { status: 'error: tunnel unavailable', running: false });
                sendHostEvent('host-error', 'tunnel unavailable');
                try { sendTrayState(); } catch (e) {}
              };

              const announceTunnelReady = (rawUrl, providerLabel) => {
                const tunnelUrl = String(rawUrl || '').trim();
                if (!tunnelUrl) return;
                let wsUrl = tunnelUrl;
                if (/^https:\/\//i.test(tunnelUrl)) wsUrl = tunnelUrl.replace(/^https:\/\//i, 'wss://');
                else if (/^http:\/\//i.test(tunnelUrl)) wsUrl = tunnelUrl.replace(/^http:\/\//i, 'ws://');
                else if (!/^wss?:\/\//i.test(tunnelUrl)) wsUrl = 'wss://' + tunnelUrl.replace(/^\/+/, '');
                if (!wsUrl) return;
                if (announcedWss === wsUrl) return;
                announcedWss = wsUrl;
                sendHostEvent('host-share', wsUrl);
                sendHostEvent('host-status', { status: `running (${providerLabel})`, running: true });
                emitHostLog(`[host] WSS Link: ${wsUrl}`);
              };

              const startLocalTunnel = (reasonLabel) => {
                if (announcedWss) return true;
                if (hostState.cloudflaredProc) return true;
                if (!ltPath && !ltScriptPath) return false;
                sendHostEvent('host-status', { status: 'starting localtunnel fallback', running: true });
                emitHostLog(`[host] Starting localtunnel fallback${reasonLabel ? ` (${reasonLabel})` : ''}`);
                let ltProc;
                try {
                  if (ltScriptPath) {
                    const ltEnv = Object.assign({}, process.env || {});
                    ltEnv.ELECTRON_RUN_AS_NODE = '1';
                    emitHostLog(`[host] launching Server bundle in localtunnel @ ${sanitizePath(ltScriptPath)}`);
                    ltProc = spawn(process.execPath, [ltScriptPath, '--port', '8080', '--local-host', '127.0.0.1', '--host', 'https://localtunnel.me'], { cwd: parentDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false, env: ltEnv });
                  } else {
                    emitHostLog(`[host] launching Server bundle in localtunnel @ ${sanitizePath(ltPath)}`);
                    ltProc = spawn(ltPath, ['--port', '8080', '--local-host', '127.0.0.1', '--host', 'https://localtunnel.me'], { cwd: parentDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
                  }
                } catch (e) {
                  emitHostLog('[error] localtunnel launch failed: ' + (e && e.message));
                  return false;
                }
                hostState.cloudflaredProc = ltProc;
                let ltBuffer = '';
                let ltErrorLines = 0;
                let ltProbeTimer = null;
                let ltProbeAttempts = 0;
                let ltProbeInFlight = false;
                let ltProbeTarget = '';
                let ltAnnounceFallbackTimer = null;
                let ltTimer = setTimeout(() => {
                  if (announcedWss) return;
                  if (hostState.cloudflaredProc !== ltProc) return;
                  emitHostLog('[error] localtunnel: tunnel startup timed out');
                  try { ltProc.kill(); } catch (e) {}
                }, 45000);
                const clearLtTimer = () => {
                  if (!ltTimer) return;
                  clearTimeout(ltTimer);
                  ltTimer = null;
                };
                const clearLtProbeTimer = () => {
                  if (!ltProbeTimer) return;
                  clearTimeout(ltProbeTimer);
                  ltProbeTimer = null;
                };
                const clearLtAnnounceFallbackTimer = () => {
                  if (!ltAnnounceFallbackTimer) return;
                  clearTimeout(ltAnnounceFallbackTimer);
                  ltAnnounceFallbackTimer = null;
                };
                const probeAndAnnounceLocalTunnel = (rawTunnelUrl) => {
                  if (announcedWss) return;
                  const tunnelUrl = String(rawTunnelUrl || '').trim().replace(/\/+$/, '');
                  if (!tunnelUrl) return;
                  ltProbeTarget = tunnelUrl;
                  if (!ltAnnounceFallbackTimer) {
                    ltAnnounceFallbackTimer = setTimeout(() => {
                      if (announcedWss) return;
                      emitHostLog('[host] localtunnel readiness probe inconclusive, continuing with announced tunnel URL');
                      announceTunnelReady(ltProbeTarget, 'localtunnel ready');
                    }, 12000);
                  }
                  if (ltProbeInFlight) return;
                  const tryProbe = () => {
                    if (announcedWss) return;
                    if (hostState.stoppingRequested) return;
                    if (hostState.cloudflaredProc !== ltProc) return;
                    if (!ltProbeTarget) return;
                    if (ltProbeAttempts >= 20) {
                      emitHostLog('[host] localtunnel: readiness probe did not get definitive success; waiting for fallback announce');
                      return;
                    }
                    ltProbeAttempts += 1;
                    ltProbeInFlight = true;
                    const probeUrl = ltProbeTarget + '/health';
                    let parsed = null;
                    try { parsed = new URL(probeUrl); } catch (e) { parsed = null; }
                    if (!parsed) {
                      ltProbeInFlight = false;
                      return;
                    }
                    const client = parsed.protocol === 'http:' ? http : https;
                    const req = client.request(probeUrl, {
                      method: 'GET',
                      timeout: 2500,
                      headers: {
                        'User-Agent': 'TerrorLink',
                        'bypass-tunnel-reminder': 'true',
                        'Accept': '*/*'
                      }
                    }, (res) => {
                      let body = '';
                      res.on('data', (chunk) => { body += String(chunk || ''); });
                      res.on('end', () => {
                        ltProbeInFlight = false;
                        const statusCode = Number(res.statusCode || 0);
                        const okStatus = statusCode >= 200 && statusCode < 400;
                        if (okStatus) {
                          clearLtProbeTimer();
                          clearLtAnnounceFallbackTimer();
                          clearLtTimer();
                          announceTunnelReady(ltProbeTarget, 'localtunnel ready');
                          return;
                        }
                        clearLtProbeTimer();
                        ltProbeTimer = setTimeout(tryProbe, 800);
                      });
                    });
                    req.on('timeout', () => {
                      try { req.destroy(); } catch (e) {}
                    });
                    req.on('error', () => {
                      ltProbeInFlight = false;
                      clearLtProbeTimer();
                      ltProbeTimer = setTimeout(tryProbe, 800);
                    });
                    req.end();
                  };
                  tryProbe();
                };
                const parseLocalTunnelOutput = (rawText, isErr) => {
                  ltBuffer += String(rawText || '');
                  const lines = ltBuffer.split(/\r?\n/);
                  ltBuffer = lines.pop() || '';
                  lines.forEach((txtLine) => {
                    const line = String(txtLine || '').trim();
                    if (!line) return;
                    const m = line.match(/https?:\/\/[^\s)"']*(?:loca\.lt|localtunnel\.me)/i);
                    if (m && m[0]) {
                      probeAndAnnounceLocalTunnel(m[0]);
                      return;
                    }
                    if (isErr && /\bERR\b|error/i.test(line)) {
                      if (ltErrorLines < 8) emitHostLog('[error] localtunnel: ' + line);
                      ltErrorLines += 1;
                      if (ltErrorLines === 8) emitHostLog('[error] localtunnel: additional error output suppressed');
                    }
                  });
                };
                ltProc.stdout && ltProc.stdout.on('data', (buf2) => {
                  parseLocalTunnelOutput(String(buf2.toString()), false);
                });
                ltProc.stderr && ltProc.stderr.on('data', (buf3) => {
                  parseLocalTunnelOutput(String(buf3.toString()), true);
                });
                ltProc.on('error', (err) => {
                  clearLtTimer();
                  clearLtProbeTimer();
                  clearLtAnnounceFallbackTimer();
                  if (hostState.stoppingRequested) {
                    hostState.cloudflaredProc = null;
                    return;
                  }
                  emitHostLog('[error] localtunnel spawn error: ' + (err && err.message));
                  hostState.cloudflaredProc = null;
                  if (!announcedWss) stopServerForTunnelFailure();
                });
                ltProc.on('exit', (code, sig) => {
                  clearLtTimer();
                  clearLtProbeTimer();
                  clearLtAnnounceFallbackTimer();
                  if (hostState.cloudflaredProc === ltProc) hostState.cloudflaredProc = null;
                  if (hostState.stoppingRequested) {
                    hostState.running = !!(hostState.serverProc || hostState.cloudflaredProc);
                    return;
                  }
                  if (code && Number(code) !== 0) {
                    emitHostLog(`[error] localtunnel exited (code=${code}, sig=${sig})`);
                  }
                  if (!announcedWss && hostState.serverProc) {
                    stopServerForTunnelFailure();
                    return;
                  }
                  hostState.running = !!(hostState.serverProc || hostState.cloudflaredProc);
                  sendHostEvent('host-status', { status: hostState.running ? 'running' : 'stopped', running: !!hostState.running });
                });
                return true;
              };

              const startCloudflared = () => {
                if (forceLocalTunnel) {
                  emitHostLog('[host] debug mode: forcing localtunnel');
                  if (!startLocalTunnel('debug forced')) stopServerForTunnelFailure();
                  return;
                }
                if (!cfPath) {
                  if (forceCloudflared) {
                    emitHostLog('[error] cloudflared missing while forced');
                    stopServerForTunnelFailure();
                    return;
                  }
                  emitHostLog('[error] cloudflared missing, attempting localtunnel');
                  if (!startLocalTunnel('cloudflared missing')) stopServerForTunnelFailure();
                  return;
                }
                sendHostEvent('host-status', { status: 'starting cloudflared tunnel', running: true });
                const cfProc = spawn(cfPath, ['tunnel', '--url', 'http://127.0.0.1:8080'], { cwd: parentDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
                hostState.cloudflaredProc = cfProc;
                let cloudflaredBuffer = '';
                let sawQuickTunnelHtmlFailure = false;
                let loggedQuickTunnelHtmlFailure = false;
                let bootstrapTimer = setTimeout(() => {
                  if (announcedWss) return;
                  if (hostState.cloudflaredProc !== cfProc) return;
                  emitHostLog('[error] cloudflared: tunnel startup timed out');
                  try { cfProc.kill(); } catch (e) {}
                }, 45000);
                const clearBootstrapTimer = () => {
                  if (!bootstrapTimer) return;
                  clearTimeout(bootstrapTimer);
                  bootstrapTimer = null;
                };
                const parseCloudflaredOutput = (rawText, isErr) => {
                  cloudflaredBuffer += String(rawText || '');
                  const lines = cloudflaredBuffer.split(/\r?\n/);
                  cloudflaredBuffer = lines.pop() || '';
                  lines.forEach((txtLine) => {
                    const line = String(txtLine || '').trim();
                    if (!line) return;
                    const m = line.match(/https?:\/\/[^\s)"']*?trycloudflare\.com/i);
                    if (m && m[0]) {
                      clearBootstrapTimer();
                      announceTunnelReady(m[0], 'tunnel ready');
                    }
                    if (!isErr) return;
                    if (/Error unmarshaling QuickTunnel response|invalid character '<' looking for beginning of value|status_code="500 Internal Server Error"|Worker threw exception|api\.trycloudflare\.com/i.test(line)) {
                      sawQuickTunnelHtmlFailure = true;
                      if (!loggedQuickTunnelHtmlFailure) {
                        loggedQuickTunnelHtmlFailure = true;
                        emitHostLog('[error] cloudflared: quick tunnel provider error (500/1101)');
                      }
                      try { cfProc.kill(); } catch (e) {}
                      return;
                    }
                    if (sawQuickTunnelHtmlFailure && /^<[^>]+>/.test(line)) return;
                    if (/origin certificate path|origincert|TUNNEL_ORIGIN_CERT/i.test(line)) return;
                    if (/\bERR\b|error/i.test(line)) emitHostLog('[error] cloudflared: ' + line);
                  });
                };
                cfProc.stdout && cfProc.stdout.on('data', (buf2) => {
                  parseCloudflaredOutput(String(buf2.toString()), false);
                });
                cfProc.stderr && cfProc.stderr.on('data', (buf3) => {
                  parseCloudflaredOutput(String(buf3.toString()), true);
                });
                cfProc.on('error', (err) => {
                  clearBootstrapTimer();
                  if (hostState.stoppingRequested) {
                    if (hostState.cloudflaredProc === cfProc) hostState.cloudflaredProc = null;
                    return;
                  }
                  emitHostLog('[error] cloudflared spawn error: ' + (err && err.message));
                  if (hostState.cloudflaredProc === cfProc) hostState.cloudflaredProc = null;
                  if (!forceCloudflared && !announcedWss && !fallbackAttempted) {
                    fallbackAttempted = true;
                    if (startLocalTunnel('cloudflared spawn error')) return;
                  }
                  if (!announcedWss) stopServerForTunnelFailure();
                });
                cfProc.on('exit', (code, sig) => {
                  clearBootstrapTimer();
                  if (hostState.cloudflaredProc === cfProc) hostState.cloudflaredProc = null;
                  if (hostState.stoppingRequested) {
                    hostState.running = !!(hostState.serverProc || hostState.cloudflaredProc);
                    return;
                  }
                  if (code && Number(code) !== 0) {
                    emitHostLog(`[error] cloudflared exited (code=${code}, sig=${sig})`);
                  }
                  if (!forceCloudflared && !fallbackAttempted) {
                    fallbackAttempted = true;
                    announcedWss = null;
                    if (startLocalTunnel('cloudflared unavailable')) return;
                  }
                  if (!announcedWss && hostState.serverProc) {
                    stopServerForTunnelFailure();
                    return;
                  }
                  hostState.running = !!(hostState.serverProc || hostState.cloudflaredProc);
                  sendHostEvent('host-status', { status: hostState.running ? 'running' : 'stopped', running: !!hostState.running });
                });
              };

              startCloudflared();
            } catch (e) {
              emitHostLog('[error] failed to launch cloudflared: ' + (e && e.message));
            }
          }
        });

        serverProc.stderr && serverProc.stderr.on('data', (buf) => {
          const errTxt = String(buf.toString());
          debugWrite('server stderr: ' + errTxt.trim());
          if (hostState.stoppingRequested) return;
          emitHostLog('[error] server: ' + errTxt.trim());
        });

        serverProc.on('exit', (code, sig) => {
          debugWrite('serverProc exited code=' + code + ' sig=' + sig);
          hostState.serverProc = null;
          if (!hostState.stoppingRequested && code && Number(code) !== 0) {
            emitHostLog(`[error] server exited (code=${code}, sig=${sig})`);
          }
          hostState.running = !!(hostState.serverProc || hostState.cloudflaredProc);
          sendHostEvent('host-status', { status: hostState.running ? 'running' : 'stopped', running: !!hostState.running });
          try { sendTrayState(); } catch (e) {}
          try {
            if (serverProc && serverProc._tempServerPath) {
              try { fs.unlinkSync(serverProc._tempServerPath); } catch (e) {}
              serverProc._tempServerPath = null;
            }
          } catch (e) {}
        });
        serverProc.on('close', (code) => {
          if (!hostState.stoppingRequested && code && Number(code) !== 0) {
            emitHostLog(`[error] server closed (code=${code})`);
          }
        });

        hostState.serverProc = serverProc;
        hostState.running = true;
        sendHostEvent('host-status', { status: 'starting', running: true });
      } catch (err) {
        sendHostEvent('host-error', (err && err.message) || String(err));
      }
    });

    ipcMain.on('host-stop', () => {
      try {
        hostState.stoppingRequested = true;
        function killPid(pid) {
          try {
            if (!pid) return;
            const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
            tk.on('close', () => {});
          } catch (e) { emitHostLog('[error] killPid failed: ' + (e && e.message)); }
        }

        if (hostState.cloudflaredProc && hostState.cloudflaredProc.pid) {
          killPid(hostState.cloudflaredProc.pid);
          hostState.cloudflaredProc = null;
        }
        if (hostState.serverProc && hostState.serverProc.pid) {
          killPid(hostState.serverProc.pid);
          hostState.serverProc = null;
        }
        hostState.running = false;
        sendHostEvent('host-status', { status: 'stopped', running: false });
        try { sendTrayState(); } catch (e) {}
      } catch (e) {
        sendHostEvent('host-error', (e && e.message) || String(e));
      }
    });

    ipcMain.on('host-kick-user', (event, username) => {
      try {
        if (hostState.serverProc && hostState.serverProc.connected) {
          hostState.serverProc.send({ type: 'kick', username });
        }
      } catch (e) {
        emitHostLog('[error] kick error: ' + (e && e.message));
      }
    });

    ipcMain.on('host-settings', (event, settings) => {
      try {
        if (hostState.serverProc && hostState.serverProc.connected) {
          hostState.serverProc.send({ type: 'settings', ...settings });
        }
      } catch (e) {
        emitHostLog('[error] settings error: ' + (e && e.message));
      }
    });

    ipcMain.on('host-get-users', () => {
      try {
        if (hostState.serverProc && hostState.serverProc.connected) {
          hostState.serverProc.send({ type: 'get-users' });
        }
      } catch (e) {
        emitHostLog('[error] get-users error: ' + (e && e.message));
      }
    });

    ipcMain.on('host-pin-message', (_event, payload) => {
      try {
        const data = payload && typeof payload === 'object' ? payload : {};
        const id = (typeof data.id === 'string' ? data.id : '').trim();
        if (!id) return;
        const pinned = !!data.pinned;
        if (hostState.serverProc && hostState.serverProc.connected) {
          hostState.serverProc.send({ type: 'pin-message', id, pinned });
        }
      } catch (e) {
        emitHostLog('[error] pin message error: ' + (e && e.message));
      }
    });

    ipcMain.on('host-system-message', (event, text) => {
      try {
        if (hostState.serverProc && hostState.serverProc.connected) {
          hostState.serverProc.send({ type: 'host-system-message', text });
        }
      } catch (e) {
        emitHostLog('[error] system message error: ' + (e && e.message));
      }
    });

    ipcMain.on('debug-logging-toggle', (event, enabled) => {
      try {
        debugLoggingEnabled = !!enabled;
        debugWrite('Debug logging ' + (debugLoggingEnabled ? 'enabled' : 'disabled'));
      } catch (e) {}
    });

    ipcMain.on('devtools-toggle', (event, enabled) => {
      try {
        if (enabled) {
          registerDevToolsShortcuts();
        } else {
          unregisterDevToolsShortcuts();
        }
      } catch (e) {
        debugWrite('devtools-toggle error: ' + (e && e.message));
      }
    });
  }
  
  debugWrite('registerIPCHandlers: completed successfully');
}

});

app.on('before-quit', () => {
  quitting = true;
  try { globalShortcut.unregisterAll(); } catch (e) {}
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    app.quit();
  }
});

ipcMain.handle('tray-toggle-window', () => {
  try {
    if (!win) return false;
    if (win.isVisible()) {
      win.hide();
      win.setSkipTaskbar(true);
    } else {
      bringOverlayToFront();
    }
    try { sendTrayState(); } catch (e) {}
    return true;
  } catch (e) { return false; }
});

ipcMain.handle('tray-preload-ready', () => {
  try { debugWrite('tray-preload ready (ipc)'); } catch (e) {}
  return true;
});