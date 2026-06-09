import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, createUpdateService } from '../electron/updateService.js';

test('compareVersions orders semver-like versions', () => {
  assert.equal(compareVersions('1.2.0', '1.1.9') > 0, true);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
  assert.equal(compareVersions('1.2.0', '1.3.0') < 0, true);
});

test('update service reports available updates from manifest', async () => {
  const logger = {
    info() {},
    error() {},
  };
  const service = createUpdateService({
    currentVersion: '1.0.0',
    manifestUrl: 'https://example.com/update.json',
    logger,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          version: '1.1.0',
          notes: 'Bug fixes and parser improvements',
          downloadUrl: 'https://example.com/download',
        };
      },
    }),
  });

  const state = await service.checkForUpdates();
  assert.equal(state.status, 'available');
  assert.equal(state.latestVersion, '1.1.0');
});
