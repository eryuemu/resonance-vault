const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session } = require('electron');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { mkdir, readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { serveMedia } = require('./media.cjs');

const appId = 'io.github.eryuemu.resonancevault';
const appUrl = 'vault://app/';
const frontend = path.join(__dirname, '..', 'dist');
const legacyLinuxData = process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share');
const libraryDir = path.join(process.platform === 'linux' ? legacyLinuxData : app.getPath('appData'), appId);
const index = path.join(libraryDir, 'library.json');
const coverCache = path.join(libraryDir, 'covers');
const helperName = process.platform === 'win32' ? 'vault-library.exe' : 'vault-library';
const helper = app.isPackaged
  ? path.join(process.resourcesPath, helperName)
  : path.join(__dirname, '..', 'native', 'target', 'release', helperName);
const exec = promisify(execFile);
let mainWindow;
let importing;
let mediaFiles = new Map();
const mediaSession = randomUUID();

app.setName('Resonance Vault');
app.setAppUserModelId(appId);
protocol.registerSchemesAsPrivileged([
  { scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

async function libraryCommand(command, ...args) {
  try {
    const { stdout } = await exec(helper, [command, index, ...args], {
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('音乐库组件缺失，请重新构建或安装应用。');
    throw new Error(error.stderr?.trim() || '无法读取音乐库。');
  }
}

async function exposeAlbums(albums) {
  const files = new Map();
  const mediaUrl = (filename, id) => {
    if (!filename || !path.isAbsolute(filename)) return undefined;
    const key = encodeURIComponent(id);
    files.set(key, filename);
    return `${appUrl}media/${mediaSession}/${key}`;
  };
  const result = await Promise.all(albums.map(async (album) => {
    const artwork = album.artwork && await stat(album.artwork).catch(() => null);
    return {
      ...album,
      artwork: artwork?.isFile() ? mediaUrl(album.artwork, `cover-${album.id}`) : '',
      videoUrl: mediaUrl(album.videoUrl, `pv-${album.id}`),
      tracks: album.tracks.map((track) => ({ ...track, audioUrl: mediaUrl(track.audioUrl, track.id) }))
    };
  }));
  mediaFiles = files;
  return result;
}

function registerProtocol() {
  protocol.handle('vault', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app' || !['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, { status: 404 });
    }
    if (url.pathname.startsWith('/media/')) {
      const [, , token, key, extra] = url.pathname.split('/');
      const filename = !extra && token === mediaSession ? mediaFiles.get(key) : undefined;
      if (!filename) return new Response(null, { status: 404 });
      return serveMedia(filename, request);
    }
    if (url.pathname === '/') {
      return new Response(await readFile(path.join(frontend, 'index.html')), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'"
        }
      });
    }
    if (!/^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(path.join(frontend, url.pathname)).href)
      .catch(() => new Response(null, { status: 404 }));
  });
}

function registerLibrary() {
  function verifySender(event) {
    if (!mainWindow || event.sender !== mainWindow.webContents ||
        event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== appUrl) {
      throw new Error('无法从此页面访问音乐库。');
    }
  }
  ipcMain.handle('vault:load', async (event) => {
    verifySender(event);
    if (importing) await importing.catch(() => {});
    return exposeAlbums((await libraryCommand('load')).albums);
  });
  ipcMain.handle('vault:import', async (event) => {
    verifySender(event);
    if (importing) return importing;
    importing = (async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '选择音乐文件夹（包含子文件夹）',
        properties: ['openDirectory']
      });
      if (canceled || !filePaths[0]) return null;
      await mkdir(libraryDir, { recursive: true });
      const { library, ...result } = await libraryCommand('import', filePaths[0], coverCache);
      return { ...result, albums: await exposeAlbums(library.albums) };
    })();
    try {
      return await importing;
    } finally {
      importing = undefined;
    }
  });
}

function requestImport() {
  mainWindow?.webContents.send('vault:choose-folder');
}

function openWindow() {
  mainWindow = new BrowserWindow({
    title: '共鸣典藏馆 · Resonance Vault',
    width: 1440,
    height: 960,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#0d0e11',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: path.join(__dirname, 'icon.png') } : {}),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-frame-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const modifier = process.platform === 'darwin' ? input.meta : input.control;
    if (!modifier || input.alt || input.shift || input.key.toLowerCase() !== 'o') return;
    event.preventDefault();
    if (input.type === 'keyDown' && !input.isAutoRepeat) requestImport();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = undefined; });
  return mainWindow.loadURL(appUrl);
}

// Electron chooses Ozone before the main script runs, so pass this as a startup argument.
const useXWayland = process.platform === 'linux' && process.env.DISPLAY &&
  (process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland') &&
  existsSync('/proc/driver/nvidia/version') &&
  !process.argv.some((argument) => /^--ozone-platform(?:=|$)/.test(argument));

if (useXWayland) {
  app.relaunch({
    execPath: process.env.APPIMAGE || process.execPath,
    args: ['--ozone-platform=x11', ...process.argv.slice(1)]
  });
  app.exit();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(() => {
    registerProtocol();
    registerLibrary();
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    Menu.setApplicationMenu(Menu.buildFromTemplate([{
      label: '音乐库',
      submenu: [{
        label: '添加音乐文件夹…',
        accelerator: 'CommandOrControl+O',
        click: requestImport
      }, { type: 'separator' }, { role: 'quit', label: '退出' }]
    }]));
    return openWindow();
  }).catch((error) => {
    dialog.showErrorBox('无法打开共鸣典藏馆', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
