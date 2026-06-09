import fs from 'node:fs';
import path from 'node:path';

function safeMeta(meta = {}) {
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch {
    return { detail: String(meta) };
  }
}

export function createLogger(userDataPath) {
  const logDir = path.join(userDataPath, 'logs');
  const logFile = path.join(logDir, 'neural-chess.log');
  fs.mkdirSync(logDir, { recursive: true });

  function write(level, event, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      meta: safeMeta(meta),
    };
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
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
