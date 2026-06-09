const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, dialog } = require('electron');

const bootDir = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'Neural Chess'
);
const bootLogPath = path.join(bootDir, 'boot.log');

function writeBootLog(event, meta = {}) {
  try {
    fs.mkdirSync(bootDir, { recursive: true });
    fs.appendFileSync(
      bootLogPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), event, meta })}\n`,
      'utf8'
    );
  } catch {
    return;
  }
}

writeBootLog('bootstrap.start', {
  packaged: app.isPackaged,
  cwd: process.cwd(),
});

import('./main.js')
  .then((module) => module.bootPromise)
  .then(() => {
    writeBootLog('bootstrap.ready');
  })
  .catch((error) => {
    writeBootLog('bootstrap.failed', {
      message: error?.message || String(error),
      stack: error?.stack || '',
    });

    const showFailure = () => {
      dialog.showErrorBox(
        'Neural Chess failed to start',
        `${error?.message || String(error)}\n\nBoot log: ${bootLogPath}`
      );
    };

    if (app.isReady()) {
      showFailure();
      return;
    }

    app.whenReady().then(showFailure).catch(() => {});
  });
