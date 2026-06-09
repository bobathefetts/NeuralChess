export function compareVersions(left = '0.0.0', right = '0.0.0') {
  const a = String(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(a.length, b.length);
  for (let index = 0; index < maxLength; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function createUpdateService({ currentVersion, manifestUrl, logger, fetchImpl = fetch }) {
  let state = {
    status: manifestUrl ? 'idle' : 'disabled',
    currentVersion,
    latestVersion: currentVersion,
    checkedAt: null,
    message: manifestUrl ? 'Ready to check for updates.' : 'No update manifest configured.',
    notes: '',
    downloadUrl: '',
  };

  async function checkForUpdates() {
    if (!manifestUrl) {
      state = {
        ...state,
        status: 'disabled',
        checkedAt: new Date().toISOString(),
      };
      return state;
    }

    state = {
      ...state,
      status: 'checking',
      message: 'Checking for updates...',
    };

    try {
      const response = await fetchImpl(manifestUrl, {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
      if (!response.ok) {
        throw new Error(`Update manifest request failed: ${response.status}`);
      }
      const manifest = normalizeManifest(await response.json());
      const isNewer = compareVersions(manifest.version, currentVersion) > 0;
      state = {
        status: isNewer ? 'available' : 'not-available',
        currentVersion,
        latestVersion: manifest.version,
        checkedAt: new Date().toISOString(),
        message: isNewer ? `Version ${manifest.version} is available.` : 'You are up to date.',
        notes: manifest.notes,
        downloadUrl: manifest.downloadUrl,
      };
      logger.info('updates.checked', {
        currentVersion,
        latestVersion: manifest.version,
        status: state.status,
      });
      return state;
    } catch (error) {
      state = {
        ...state,
        status: 'error',
        checkedAt: new Date().toISOString(),
        message: error.message,
      };
      logger.error('updates.check_failed', { message: error.message });
      return state;
    }
  }

  function getState() {
    return state;
  }

  return {
    getState,
    checkForUpdates,
  };
}

function normalizeManifest(manifest = {}) {
  return {
    version: String(manifest.version || '0.0.0'),
    notes: String(manifest.notes || ''),
    downloadUrl: String(manifest.downloadUrl || manifest.url || ''),
  };
}
