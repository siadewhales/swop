const { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isLiveMode = process.env.SWOP_LIVE === '1' || process.argv.includes('--swop-live');
const windowIcon = path.join(__dirname, '..', 'build', 'icon.ico');
const SECRET_CLIPBOARD_MS = 30000;
let mainWindow = null;
let quittingAfterCleanup = false;
let secretClipboard = null;

async function clearRuntimeStorage() {
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData();
  } catch {
    // The version lock lives outside Chromium storage and remains protected.
  }
}

// Claves privadas y frases copiadas: se borran solas del portapapeles a los 30 s y al cerrar SWOP,
// siempre que no se haya copiado otra cosa encima.
function clearSecretClipboard() {
  if (!secretClipboard) return;
  clearTimeout(secretClipboard.timer);
  try {
    if (clipboard.readText() === secretClipboard.value) clipboard.clear();
  } catch {
    // If the clipboard is not available there is nothing else to clear.
  }
  secretClipboard = null;
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function splitNmcliLine(line) {
  const parts = [];
  let current = '';
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === ':') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

async function getLiveNetworkStatus() {
  if (!isLiveMode || process.platform !== 'linux') return { live: isLiveMode, connected: false, wifi: false };
  try {
    const output = await runCommand('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'dev', 'status']);
    const devices = output.split(/\r?\n/).filter(Boolean).map((line) => {
      const [device, type, state, connection] = splitNmcliLine(line);
      return { device, type, state, connection };
    });
    return {
      live: true,
      connected: devices.some((device) => device.state === 'connected'),
      wifi: devices.some((device) => device.type === 'wifi' && device.state === 'connected'),
      devices
    };
  } catch {
    return { live: true, connected: false, wifi: false, devices: [] };
  }
}

async function listWifiNetworks() {
  if (!isLiveMode || process.platform !== 'linux') return { ok: false, networks: [] };
  try {
    await runCommand('nmcli', ['radio', 'wifi', 'on']);
    const output = await runCommand('nmcli', ['-t', '-f', 'SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list', '--rescan', 'yes']);
    const seen = new Set();
    const networks = output.split(/\r?\n/).filter(Boolean).map((line) => {
      const [ssid, signal, security] = splitNmcliLine(line);
      return { ssid, signal: Number(signal) || 0, security };
    }).filter((network) => {
      if (!network.ssid || seen.has(network.ssid)) return false;
      seen.add(network.ssid);
      return true;
    }).sort((a, b) => b.signal - a.signal);
    return { ok: true, networks };
  } catch {
    return { ok: false, networks: [] };
  }
}

async function connectWifiNetwork(payload) {
  if (!isLiveMode || process.platform !== 'linux') return { ok: false };
  const ssid = String(payload?.ssid || '');
  const password = String(payload?.password || '');
  if (!ssid) return { ok: false };
  try {
    const args = ['dev', 'wifi', 'connect', ssid];
    if (password) args.push('password', password);
    await runCommand('nmcli', args);
    return { ok: true, status: await getLiveNetworkStatus() };
  } catch {
    return { ok: false };
  }
}

async function disconnectWifiNetwork() {
  if (!isLiveMode || process.platform !== 'linux') return { ok: false };
  try {
    await runCommand('nmcli', ['radio', 'wifi', 'off']);
    await runCommand('nmcli', ['radio', 'wifi', 'on']);
    return { ok: true, status: await getLiveNetworkStatus() };
  } catch {
    return { ok: false };
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: isLiveMode ? 1366 : 1280,
    height: isLiveMode ? 768 : 820,
    minWidth: isLiveMode ? 900 : 1040,
    minHeight: isLiveMode ? 620 : 700,
    backgroundColor: '#0D1218',
    icon: windowIcon,
    title: 'SWOP',
    fullscreen: isLiveMode,
    kiosk: isLiveMode,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow = win;
  win.removeMenu();
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isLiveMode) {
    win.on('close', (event) => {
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        title: 'SWOP Live',
        message: 'Apagar SWOP Live',
        detail: 'Cerrar SWOP apagara este entorno seguro.',
        buttons: ['Apagar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      });
      if (choice === 0) {
        execFile('systemctl', ['poweroff'], () => {
          execFile('poweroff', []);
        });
      }
    });
  }

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // La ventana solo muestra SWOP: nunca navega a otra página (que heredaría el puente window.whales)
  // ni incrusta webviews. Los enlaces externos se abren en el navegador del sistema.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:is-live-mode', () => isLiveMode);
ipcMain.handle('live:network-status', () => getLiveNetworkStatus());
ipcMain.handle('live:wifi-list', () => listWifiNetworks());
ipcMain.handle('live:wifi-connect', (_event, payload) => connectWifiNetwork(payload));
ipcMain.handle('live:wifi-disconnect', () => disconnectWifiNetwork());
ipcMain.handle('version-lock:get', () => {
  try {
    const lockPath = path.join(app.getPath('userData'), 'swop-version-lock.json');
    if (!fs.existsSync(lockPath)) return null;
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
});
ipcMain.handle('version-lock:set', (_event, lock) => {
  const lockPath = path.join(app.getPath('userData'), 'swop-version-lock.json');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(lock || {}, null, 2), 'utf8');
  return true;
});
ipcMain.handle('clipboard:copy', (_event, text) => {
  clipboard.writeText(String(text || ''));
  return true;
});
ipcMain.handle('clipboard:copy-secret', (_event, text) => {
  const value = String(text || '');
  clearTimeout(secretClipboard?.timer);
  clipboard.writeText(value);
  secretClipboard = { value, timer: setTimeout(clearSecretClipboard, SECRET_CLIPBOARD_MS) };
  return SECRET_CLIPBOARD_MS;
});
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('external:open', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
  return false;
});

app.whenReady().then(async () => {
  // SWOP no necesita cámara, micrófono, ubicación ni notificaciones: se deniega cualquier permiso.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await clearRuntimeStorage();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (quittingAfterCleanup) return;
  event.preventDefault();
  quittingAfterCleanup = true;
  clearSecretClipboard();
  await clearRuntimeStorage();
  app.quit();
});
