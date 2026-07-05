const { autoUpdater } = require('electron-updater');
const { dialog, app, BrowserWindow } = require('electron');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let onReadyToLaunch = null;
let progressWindow = null;

function createProgressWindow() {
  const fs = require('fs');
  const path = require('path');
  const settingsPath = path.join(app.getPath('userData'), 'terrorlink_settings.json');
  let theme = 'default';
  try {
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData);
      theme = settings.theme || 'default';
    }
  } catch (e) {}

  const themes = {
    default: {
      bg: 'rgba(18, 8, 15, 0.95)',
      accent: '#bb86ff',
      accentDark: '#805dff',
      border: 'rgba(255, 255, 255, 0.1)'
    },
    shockwire: {
      bg: 'rgba(12, 10, 0, 0.95)',
      accent: '#ffcc00',
      accentDark: '#ff9500',
      border: 'rgba(255, 205, 44, 0.35)'
    },
    royalchain: {
      bg: 'rgba(6, 9, 25, 0.94)',
      accent: '#ffd27a',
      accentDark: '#6aa1ff',
      border: 'rgba(200, 170, 90, 0.14)'
    },
    bloodlink: {
      bg: 'rgba(12, 6, 8, 0.95)',
      accent: '#ff6b6b',
      accentDark: '#d93a3a',
      border: 'rgba(255, 107, 107, 0.25)'
    },
    rosepetal: {
      bg: 'rgba(18, 8, 15, 0.95)',
      accent: '#ff69b4',
      accentDark: '#ff1493',
      border: 'rgba(255, 105, 180, 0.3)'
    },
    toxicreactor: {
      bg: 'rgba(10, 16, 10, 0.95)',
      accent: '#8dd66a',
      accentDark: '#5ea74a',
      border: 'rgba(141, 214, 106, 0.3)'
    }
  };
  const t = themes[theme] || themes.default;

  progressWindow = new BrowserWindow({
    width: 400,
    height: 180,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false
    }
  });

  progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', system-ui, sans-serif;
          background: ${t.bg};
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          border-radius: 16px;
          border: 1px solid ${t.border};
          overflow: hidden;
        }
        .container {
          text-align: center;
          padding: 30px;
          width: 100%;
        }
        h2 {
          font-size: 18px;
          margin-bottom: 8px;
          color: ${t.accent};
        }
        .status {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 20px;
        }
        .progress-bar {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, ${t.accent}, ${t.accentDark});
          border-radius: 4px;
          transition: width 0.3s ease;
        }
        .percent {
          margin-top: 8px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Downloading Update</h2>
        <div class="status" id="status">Preparing download...</div>
        <div class="progress-bar">
          <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="percent" id="percent">0%</div>
      </div>
      <script>
        window.__updateProgress = (value) => {
          const percentValue = Math.max(0, Math.min(100, Number(value) || 0));
          const fill = document.getElementById('progressFill');
          const percent = document.getElementById('percent');
          const status = document.getElementById('status');
          if (fill) fill.style.width = percentValue + '%';
          if (percent) percent.textContent = Math.round(percentValue) + '%';
          if (status) status.textContent = 'Downloading...';
        };
      </script>
    </body>
    </html>
  `)}`);

  progressWindow.on('closed', () => {
    progressWindow = null;
  });

  return progressWindow;
}

function initAutoUpdater(launchCallback) {
  onReadyToLaunch = launchCallback;
  
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    
    const dialogResult = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Update Required',
        message: `A new version (${info.version}) is available and must be installed.`,
        detail: 'Without updating, you will not be able to communicate or connect with users on newer versions due to different server setups.\n\nClick OK to download the update now.',
        buttons: ['Download Update', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });
      
      if (dialogResult === 0) {
        console.log('Starting download...');
        createProgressWindow();
        autoUpdater.downloadUpdate().catch(err => {
          console.error('Download failed:', err);
          if (progressWindow && !progressWindow.isDestroyed()) {
            progressWindow.close();
          }
          dialog.showMessageBoxSync({
            type: 'error',
            title: 'Download Failed',
            message: 'Failed to download the update.',
            detail: err.message || 'Unknown error',
            buttons: ['Quit'],
          });
          app.quit();
        });
      } else {
        app.quit();
      }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available.');
    if (onReadyToLaunch) {
      onReadyToLaunch();
      onReadyToLaunch = null;
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    
    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.close();
    }
    

    if (onReadyToLaunch) {
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Update Check Failed',
        message: 'Could not check for updates.',
        detail: 'The app will launch anyway. Error: ' + (err.message || 'Unknown error'),
        buttons: ['Continue']
      });
      
      onReadyToLaunch();
      onReadyToLaunch = null;
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
    if (progressWindow && !progressWindow.isDestroyed()) {
      const pct = Number(progressObj.percent) || 0;
      progressWindow.webContents.executeJavaScript(`window.__updateProgress && window.__updateProgress(${pct})`).catch(() => {});
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    
    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.close();
      progressWindow = null;
    }
    
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded and is ready to install.`,
      detail: 'The app will now close and install the update.',
      buttons: ['Install Now'],
      defaultId: 0
    });
    
    autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.checkForUpdates();

  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 1000 * 60 * 60);
}

module.exports = { initAutoUpdater };
