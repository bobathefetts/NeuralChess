import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  crashReporter,
  ipcMain,
  safeStorage,
  shell,
} from 'electron';
import { Chess } from 'chess.js';
import { createLogger } from './logger.js';
import { createConfigStore } from './configStore.js';
import { createUpdateService } from './updateService.js';
import { requestLLMMove } from '../src/services/llmCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

let logger = null;
let configStore = null;
let updateService = null;
const activeMoveRequests = new Map();

export const bootPromise = boot();

async function boot() {
  await app.whenReady();

  logger = createLogger(app.getPath('userData'));
  configStore = createConfigStore({
    userDataPath: app.getPath('userData'),
    safeStorage,
    logger,
  });
  updateService = createUpdateService({
    currentVersion: app.getVersion(),
    manifestUrl: process.env.NEURAL_CHESS_UPDATE_URL || configStore.getUpdateManifestUrl(),
    logger,
  });

  startCrashReporter();
  registerProcessHandlers();
  registerIpcHandlers();
  createWindow();

  if (app.isPackaged && updateService.getState().status !== 'disabled') {
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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 1000,
    minHeight: 800,
    center: true,
    show: false,
    backgroundColor: '#050a12',
    autoHideMenuBar: true,
    title: 'Neural Chess - Human vs. AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(appRoot, 'dist', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
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
