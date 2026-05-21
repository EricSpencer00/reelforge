import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerPtyHandlers } from './ipc/pty.js';
import { registerComposeHandlers } from './ipc/compose.js';
import { registerLibraryHandlers } from './ipc/library.js';
import { registerMetaOAuthHandlers } from './ipc/oauth-meta.js';
import { registerTikTokOAuthHandlers } from './ipc/oauth-tiktok.js';
import { registerMetaPublishHandlers } from './ipc/publish-meta.js';
import { registerTikTokPublishHandlers } from './ipc/publish-tiktok.js';
import { registerSettingsHandlers } from './ipc/settings.js';
import { registerAnthropicHandlers } from './ipc/anthropic.js';
import { ensureDataDirs } from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0b0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  ensureDataDirs();

  // Serve local files (videos, rendered output) through a custom protocol
  // so the renderer can play them via <video> without absolute-path quirks.
  protocol.handle('reelforge', async (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname);
    if (!fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  registerSettingsHandlers();
  registerLibraryHandlers();
  registerPtyHandlers();
  registerComposeHandlers();
  registerAnthropicHandlers();
  registerMetaOAuthHandlers();
  registerTikTokOAuthHandlers();
  registerMetaPublishHandlers();
  registerTikTokPublishHandlers();

  ipcMain.handle('app:pick-files', async (_e, opts: { filters?: Electron.FileFilter[]; multiple?: boolean }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: opts?.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: opts?.filters,
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('app:open-external', async (_e, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('app:reveal', async (_e, p: string) => {
    shell.showItemInFolder(p);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
