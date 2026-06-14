// Wraps electron-updater's autoUpdater behind a small state machine that the
// renderer already understands (getState() shape). autoUpdater is injected so
// the event->state mapping is unit-testable with a fake EventEmitter.
export function createUpdateService({
  autoUpdater,
  currentVersion,
  logger,
  isPackaged,
  onStateChange = () => {},
}) {
  const active = Boolean(isPackaged && autoUpdater);

  let state = {
    status: active ? 'idle' : 'disabled',
    currentVersion,
    latestVersion: currentVersion,
    checkedAt: null,
    message: active
      ? 'Ready to check for updates.'
      : 'Updates are only available in the packaged app.',
    notes: '',
    progress: 0,
  };

  function setState(patch) {
    state = { ...state, ...patch };
    onStateChange(state);
  }

  if (active) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (message) => logger.info('updater', { message: String(message) }),
      warn: (message) => logger.warn('updater', { message: String(message) }),
      error: (message) => logger.error('updater', { message: String(message) }),
      debug: (message) => logger.debug('updater', { message: String(message) }),
    };

    autoUpdater.on('checking-for-update', () => {
      setState({ status: 'checking', message: 'Checking for updates...' });
    });
    autoUpdater.on('update-available', (info) => {
      setState({
        status: 'available',
        latestVersion: info.version,
        notes: stringifyNotes(info.releaseNotes),
        message: `Version ${info.version} is available.`,
        checkedAt: new Date().toISOString(),
      });
    });
    autoUpdater.on('update-not-available', (info) => {
      setState({
        status: 'not-available',
        latestVersion: info?.version || currentVersion,
        message: 'You are up to date.',
        checkedAt: new Date().toISOString(),
      });
    });
    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress?.percent || 0);
      setState({
        status: 'downloading',
        progress: percent,
        message: `Downloading update... ${percent}%`,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      setState({
        status: 'downloaded',
        latestVersion: info.version,
        progress: 100,
        message: `Version ${info.version} downloaded. Restart to install.`,
      });
    });
    autoUpdater.on('error', (error) => {
      logger.error('updates.error', { message: error?.message || String(error) });
      setState({ status: 'error', message: error?.message || 'Update error.' });
    });
  }

  async function checkForUpdates() {
    if (!active) {
      setState({ status: 'disabled', checkedAt: new Date().toISOString() });
      return state;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      logger.error('updates.check_failed', { message: error?.message || String(error) });
      setState({ status: 'error', message: error?.message || 'Update check failed.' });
    }
    return state;
  }

  async function downloadUpdate() {
    if (!active) {
      return state;
    }
    try {
      setState({ status: 'downloading', progress: 0, message: 'Downloading update...' });
      await autoUpdater.downloadUpdate();
    } catch (error) {
      logger.error('updates.download_failed', { message: error?.message || String(error) });
      setState({ status: 'error', message: error?.message || 'Update download failed.' });
    }
    return state;
  }

  function quitAndInstall() {
    if (active) {
      autoUpdater.quitAndInstall();
    }
  }

  function getState() {
    return state;
  }

  return {
    getState,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
  };
}

// GitHub releases return release notes either as a string or as an array of
// { version, note } objects (when several versions are skipped).
function stringifyNotes(notes) {
  if (!notes) {
    return '';
  }
  if (typeof notes === 'string') {
    return notes;
  }
  if (Array.isArray(notes)) {
    return notes
      .map((entry) => (typeof entry === 'string' ? entry : entry?.note || ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}
