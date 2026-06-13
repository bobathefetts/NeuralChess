import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createConfigStore } from '../electron/configStore.js';

function createSafeStorage() {
  return {
    isEncryptionAvailable() {
      return true;
    },
    encryptString(value) {
      return Buffer.from(`enc:${value}`, 'utf8');
    },
    decryptString(buffer) {
      return Buffer.from(buffer).toString('utf8').replace(/^enc:/, '');
    },
  };
}

test('config store encrypts and reloads API keys', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-chess-config-'));
  const logger = {
    info() {},
    warn() {},
    error() {},
  };

  const store = createConfigStore({
    userDataPath: tempDir,
    safeStorage: createSafeStorage(),
    logger,
  });

  store.setApiKey('secret-key');
  store.saveRendererState({
    llmConfig: {
      preset: 'openai',
      apiType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: '',
    },
    ui: {
      playerColor: 'b',
      difficulty: 'hard',
      squareSize: 88,
      disclaimerAccepted: true,
    },
  });

  const reloaded = createConfigStore({
    userDataPath: tempDir,
    safeStorage: createSafeStorage(),
    logger,
  });

  assert.equal(reloaded.getApiKey(), 'secret-key');
  assert.equal(reloaded.getRendererState().llmConfig.apiType, 'openai');
  assert.equal(reloaded.getRendererState().ui.playerColor, 'b');
  assert.equal(reloaded.getRendererState().ui.difficulty, 'hard');
});

test('config store persists and reloads window bounds', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-chess-config-'));
  const logger = { info() {}, warn() {}, error() {} };

  const store = createConfigStore({
    userDataPath: tempDir,
    safeStorage: createSafeStorage(),
    logger,
  });

  // Defaults: centered (no x/y), not maximized
  const initial = store.getWindowBounds();
  assert.equal(initial.x, undefined);
  assert.equal(initial.maximized, false);

  store.saveWindowBounds({ width: 1440, height: 900, x: 120, y: 60, maximized: true });

  const reloaded = createConfigStore({
    userDataPath: tempDir,
    safeStorage: createSafeStorage(),
    logger,
  });
  const bounds = reloaded.getWindowBounds();
  assert.equal(bounds.width, 1440);
  assert.equal(bounds.height, 900);
  assert.equal(bounds.x, 120);
  assert.equal(bounds.y, 60);
  assert.equal(bounds.maximized, true);
});

test('config store rejects undersized or non-numeric window bounds', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-chess-config-'));
  const logger = { info() {}, warn() {}, error() {} };

  const store = createConfigStore({
    userDataPath: tempDir,
    safeStorage: createSafeStorage(),
    logger,
  });

  store.saveWindowBounds({ width: 200, height: 'oops', x: 10, y: 20 });
  const bounds = store.getWindowBounds();
  // Falls back to defaults rather than persisting a broken size
  assert.equal(bounds.width, 1200);
  assert.equal(bounds.height, 860);
  assert.equal(bounds.x, 10);
});
