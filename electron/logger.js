import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file
const DEFAULT_MAX_BACKUPS = 3; // keep neural-chess.log.1 .. .3

function safeMeta(meta = {}) {
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch {
    return { detail: String(meta) };
  }
}

export function createLogger(userDataPath, options = {}) {
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const maxBackups = options.maxBackups ?? DEFAULT_MAX_BACKUPS;
  const logDir = path.join(userDataPath, 'logs');
  const logFile = path.join(logDir, 'neural-chess.log');
  fs.mkdirSync(logDir, { recursive: true });

  // Track size in memory so we don't stat() on every write.
  let currentSize = 0;
  try {
    currentSize = fs.statSync(logFile).size;
  } catch {
    currentSize = 0;
  }

  // Roll neural-chess.log -> .1, .1 -> .2, ... dropping the oldest, so the
  // log directory can never grow past (maxBackups + 1) * maxBytes.
  function rotate() {
    try {
      if (maxBackups < 1) {
        fs.rmSync(logFile, { force: true });
        return;
      }
      fs.rmSync(`${logFile}.${maxBackups}`, { force: true });
      for (let index = maxBackups - 1; index >= 1; index -= 1) {
        const src = `${logFile}.${index}`;
        if (fs.existsSync(src)) {
          fs.renameSync(src, `${logFile}.${index + 1}`);
        }
      }
      if (fs.existsSync(logFile)) {
        fs.renameSync(logFile, `${logFile}.1`);
      }
    } catch {
      // A rotation failure must not take down logging; fall through and
      // keep appending to the existing file.
    }
  }

  function write(level, event, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      meta: safeMeta(meta),
    };
    const line = `${JSON.stringify(entry)}\n`;
    const bytes = Buffer.byteLength(line, 'utf8');

    if (currentSize > 0 && currentSize + bytes > maxBytes) {
      rotate();
      currentSize = 0;
    }

    try {
      fs.appendFileSync(logFile, line, 'utf8');
      currentSize += bytes;
    } catch {
      // Disk full or permission error: drop the line rather than crash.
    }
  }

  return {
    info: (event, meta) => write('info', event, meta),
    warn: (event, meta) => write('warn', event, meta),
    error: (event, meta) => write('error', event, meta),
    debug: (event, meta) => write('debug', event, meta),
    getLogFilePath: () => logFile,
    getLogDirectory: () => logDir,
  };
}
