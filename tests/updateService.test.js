import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createUpdateService } from '../electron/updateService.js';

function fakeAutoUpdater() {
  const emitter = new EventEmitter();
  emitter.checkForUpdates = async () => {};
  emitter.downloadUpdate = async () => {};
  emitter.quitAndInstall = () => {
    emitter.installed = true;
  };
  return emitter;
}

const logger = { info() {}, warn() {}, error() {}, debug() {} };

test('update service is disabled when not packaged', async () => {
  const service = createUpdateService({
    autoUpdater: fakeAutoUpdater(),
    currentVersion: '1.0.0',
    logger,
    isPackaged: false,
  });
  assert.equal(service.getState().status, 'disabled');
  const state = await service.checkForUpdates();
  assert.equal(state.status, 'disabled');
});

test('update service maps autoUpdater events to renderer state', () => {
  const autoUpdater = fakeAutoUpdater();
  const pushed = [];
  const service = createUpdateService({
    autoUpdater,
    currentVersion: '1.0.0',
    logger,
    isPackaged: true,
    onStateChange: (state) => pushed.push(state.status),
  });

  autoUpdater.emit('checking-for-update');
  assert.equal(service.getState().status, 'checking');

  autoUpdater.emit('update-available', { version: '1.2.0', releaseNotes: 'Fixes' });
  assert.equal(service.getState().status, 'available');
  assert.equal(service.getState().latestVersion, '1.2.0');
  assert.equal(service.getState().notes, 'Fixes');

  autoUpdater.emit('download-progress', { percent: 42.7 });
  assert.equal(service.getState().status, 'downloading');
  assert.equal(service.getState().progress, 43);

  autoUpdater.emit('update-downloaded', { version: '1.2.0' });
  assert.equal(service.getState().status, 'downloaded');
  assert.equal(service.getState().progress, 100);

  // Every transition is pushed to the renderer.
  assert.deepEqual(pushed, ['checking', 'available', 'downloading', 'downloaded']);
});

test('update service flattens array-form release notes', () => {
  const autoUpdater = fakeAutoUpdater();
  const service = createUpdateService({
    autoUpdater,
    currentVersion: '1.0.0',
    logger,
    isPackaged: true,
  });
  autoUpdater.emit('update-available', {
    version: '1.3.0',
    releaseNotes: [
      { version: '1.2.0', note: 'First' },
      { version: '1.3.0', note: 'Second' },
    ],
  });
  assert.equal(service.getState().notes, 'First\n\nSecond');
});

test('update service surfaces check errors', async () => {
  const autoUpdater = fakeAutoUpdater();
  autoUpdater.checkForUpdates = async () => {
    throw new Error('network down');
  };
  const service = createUpdateService({
    autoUpdater,
    currentVersion: '1.0.0',
    logger,
    isPackaged: true,
  });
  const state = await service.checkForUpdates();
  assert.equal(state.status, 'error');
  assert.match(state.message, /network down/);
});

test('quitAndInstall delegates to autoUpdater when packaged', () => {
  const autoUpdater = fakeAutoUpdater();
  const service = createUpdateService({
    autoUpdater,
    currentVersion: '1.0.0',
    logger,
    isPackaged: true,
  });
  service.quitAndInstall();
  assert.equal(autoUpdater.installed, true);
});
