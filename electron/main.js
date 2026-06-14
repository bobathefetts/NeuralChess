import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  crashReporter,
  ipcMain,
  safeStorage,
  screen,
  session,
  shell,
} from 'electron';
import { Chess } from 'chess.js';
import electronUpdater from 'electron-updater';
import { createLogger } from './logger.js';
import { createConfigStore } from './configStore.js';
import { createUpdateService } from './updateService.js';
import { requestLLMMove } from '../src/services/llmCore.js';

// electron-updater is CommonJS; destructure the autoUpdater singleton.
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

let logger = null;
let configStore = null;
let updateService = null;
const activeMoveRequests = new Map();

export const bootPromise = boot();

async function boot() {
  await app.whenReady();

  const migratedLegacyDir = migrateLegacyUserData();
  logger = createLogger(app.getPath('userData'));
  if (migratedLegacyDir) {
    logger.info('config.legacy_userdata_migrated', { from: migratedLegacyDir });
  }
  configStore = createConfigStore({
    userDataPath: app.getPath('userData'),
    safeStorage,
    logger,
  });
  updateService = createUpdateService({
    autoUpdater,
    currentVersion: app.getVersion(),
    logger,
    isPackaged: app.isPackaged,
    onStateChange: broadcastUpdateState,
  });

  applyContentSecurityPolicy();
  startCrashReporter();
  registerProcessHandlers();
  registerIpcHandlers();
  createWindow();

  if (app.isPackaged) {
    updateService.checkForUpdates().catch((error) => {
      logger.error('updates.startup_check_failed', { message: error.message });
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// The app was renamed from "chess-ai" to "Neural Chess", which moved the
// userData directory. Copy the old config the first time the new dir is empty.
// Windows safeStorage uses per-user DPAPI, so the encrypted API key stays
// readable after the copy; on other platforms the key may need re-entry.
function migrateLegacyUserData() {
  try {
    const userDataPath = app.getPath('userData');
    const legacyDir = path.join(path.dirname(userDataPath), 'chess-ai');
    const configPath = path.join(userDataPath, 'app-config.json');
    const legacyConfigPath = path.join(legacyDir, 'app-config.json');
    if (fs.existsSync(configPath) || !fs.existsSync(legacyConfigPath)) {
      return null;
    }
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.copyFileSync(legacyConfigPath, configPath);
    return legacyDir;
  } catch {
    return null;
  }
}

// Lock the renderer down with a Content-Security-Policy. The renderer never
// needs to load remote scripts, so script-src 'self' blocks injected code.
// connect-src is intentionally broad: in desktop mode the renderer still
// fetches the Ollama model list directly, and providers live at
// user-configured http/https endpoints.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' http: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });
}

// Saved coordinates may point at a monitor that is no longer connected.
// Drop x/y (re-center) unless the window would land on a current display.
function ensureOnScreen(bounds) {
  if (bounds.x === undefined || bounds.y === undefined) {
    return bounds;
  }
  const visible = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    );
  });
  return visible ? bounds : { ...bounds, x: undefined, y: undefined };
}

function createWindow() {
  const bounds = ensureOnScreen(configStore.getWindowBounds());
  const mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1000,
    minHeight: 800,
    center: bounds.x === undefined,
    show: false,
    backgroundColor: '#050a12',
    autoHideMenuBar: true,
    title: 'Neural Chess - Human vs. AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (bounds.maximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(appRoot, 'dist', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  // Block in-app navigation away from the bundled renderer; route external
  // http/https links to the system browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch(() => {});
      }
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('renderer.process_gone', details);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('window.loaded', { packaged: app.isPackaged });
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  registerWindowStatePersistence(mainWindow);
}

// Persist window size, position, and maximized state across launches.
function registerWindowStatePersistence(mainWindow) {
  let saveTimer = null;

  const persist = () => {
    if (mainWindow.isDestroyed()) {
      return;
    }
    const isMaximized = mainWindow.isMaximized();
    // normalBounds gives the restored (un-maximized) geometry so we can
    // reopen at the right size after un-maximizing.
    const bounds = mainWindow.getNormalBounds();
    configStore.saveWindowBounds({ ...bounds, maximized: isMaximized });
  };

  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  };

  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);
  mainWindow.on('maximize', scheduleSave);
  mainWindow.on('unmaximize', scheduleSave);
  mainWindow.on('close', () => {
    clearTimeout(saveTimer);
    persist();
  });
}

function startCrashReporter() {
  crashReporter.start({
    productName: 'Neural Chess',
    uploadToServer: false,
    compress: true,
    ignoreSystemCrashHandler: false,
    globalExtra: {
      appVersion: app.getVersion(),
      channel: app.isPackaged ? 'stable' : 'development',
    },
  });
}

function registerProcessHandlers() {
  process.on('uncaughtException', (error) => {
    logger.error('main.uncaught_exception', {
      message: error.message,
      stack: error.stack,
    });
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('main.unhandled_rejection', {
      reason: String(reason),
    });
  });

  app.on('child-process-gone', (_event, details) => {
    logger.error('app.child_process_gone', details);
  });
}

// Push update state (including live download progress) to every window.
function broadcastUpdateState(updateState) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('updates:state', updateState);
    }
  }
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-bootstrap', async () => ({
    runtime: {
      isDesktop: true,
      isPackaged: app.isPackaged,
      version: app.getVersion(),
      platform: process.platform,
      logFilePath: logger.getLogFilePath(),
    },
    storedState: configStore.getRendererState(),
    updateState: updateService.getState(),
  }));

  ipcMain.handle('config:save-renderer-state', async (_event, payload) =>
    configStore.saveRendererState(payload)
  );

  ipcMain.handle('config:import-legacy-state', async (_event, payload) =>
    configStore.importLegacyState(payload)
  );

  ipcMain.handle('config:set-api-key', async (_event, apiKey) => configStore.setApiKey(apiKey));
  ipcMain.handle('config:clear-api-key', async () => configStore.clearApiKey());

  ipcMain.handle('llm:request-move', async (event, payload) => {
    const controller = new AbortController();
    activeMoveRequests.set(payload.requestId, controller);
    const runtimeConfig = {
      ...payload.config,
      apiKey: configStore.getApiKey(),
    };

    logger.info('llm.request_started', {
      requestId: payload.requestId,
      apiType: runtimeConfig.apiType,
      model: runtimeConfig.model || '(provider-default)',
      difficulty: payload.difficulty,
    });

    try {
      const move = await requestLLMMove({
        config: runtimeConfig,
        fen: payload.fen,
        moveHistory: payload.moveHistory,
        game: new Chess(payload.fen),
        difficulty: payload.difficulty,
        errorFeedback: payload.errorFeedback,
        signal: controller.signal,
        logger,
        onToken: (chunk, fullText) => {
          event.sender.send('llm:move-stream', {
            requestId: payload.requestId,
            chunk,
            fullText,
          });
        },
      });

      logger.info('llm.request_completed', {
        requestId: payload.requestId,
        move,
      });
      return move;
    } catch (error) {
      logger.error('llm.request_failed', {
        requestId: payload.requestId,
        name: error.name,
        message: error.message,
      });
      throw error;
    } finally {
      activeMoveRequests.delete(payload.requestId);
    }
  });

  ipcMain.on('llm:abort-move', (_event, requestId) => {
    activeMoveRequests.get(requestId)?.abort();
    logger.info('llm.request_aborted', { requestId });
  });

  ipcMain.handle('updates:check', async () => updateService.checkForUpdates());
  ipcMain.handle('updates:download', async () => updateService.downloadUpdate());
  ipcMain.on('updates:install', () => updateService.quitAndInstall());

  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (!url) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('shell:open-logs-directory', async () => {
    await shell.openPath(logger.getLogDirectory());
    return true;
  });

  ipcMain.on('logs:renderer-event', (_event, payload = {}) => {
    logger.info(`renderer.${payload.event || 'event'}`, payload.meta || {});
  });
}
