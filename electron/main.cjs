const { app, BrowserWindow, session, desktopCapturer } = require('electron');

const APP_URL = process.env.RONNCORD_APP_URL || 'https://ronnautomate.github.io/ronncord/';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    title: 'RONNCORD',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Grant mic, camera, and notification permissions seamlessly
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = new Set(['media', 'mediaKeySystem', 'notifications', 'fullscreen']);
    callback(allowed.has(permission));
  });

  // Enable 1080p60 screen share + system audio loopback inside Electron
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      callback({ video: sources[0], audio: 'loopback' });
    } catch {
      callback({});
    }
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
