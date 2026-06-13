import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLogger } from '../electron/logger.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'neural-chess-logger-'));
}

test('logger writes one JSON line per event', () => {
  const dir = tempDir();
  const logger = createLogger(dir);
  logger.info('first', { a: 1 });
  logger.error('second', { b: 2 });

  const lines = fs.readFileSync(logger.getLogFilePath(), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.equal(first.level, 'info');
  assert.equal(first.event, 'first');
  assert.equal(first.meta.a, 1);
});

test('logger rotates when the file exceeds maxBytes and caps backups', () => {
  const dir = tempDir();
  const logger = createLogger(dir, { maxBytes: 400, maxBackups: 2 });

  // Each line is ~80-100 bytes; 60 lines forces several rotations.
  for (let index = 0; index < 60; index += 1) {
    logger.info('rotate.me', { index, padding: 'xxxxxxxxxxxxxxxx' });
  }

  const logFile = logger.getLogFilePath();
  assert.equal(fs.existsSync(logFile), true, 'active log exists');
  assert.equal(fs.existsSync(`${logFile}.1`), true, 'backup .1 exists');
  assert.equal(fs.existsSync(`${logFile}.2`), true, 'backup .2 exists');
  assert.equal(fs.existsSync(`${logFile}.3`), false, 'no backup beyond maxBackups');

  // Active file stays under the cap (plus one line of slack).
  assert.ok(fs.statSync(logFile).size <= 500, 'active file is bounded');
});

test('logger survives a meta payload with circular references', () => {
  const dir = tempDir();
  const logger = createLogger(dir);
  const circular = {};
  circular.self = circular;
  logger.warn('circular', circular);

  const line = JSON.parse(fs.readFileSync(logger.getLogFilePath(), 'utf8').trim());
  assert.equal(line.event, 'circular');
  assert.ok('detail' in line.meta);
});
