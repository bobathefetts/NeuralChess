import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app;
let window;
let userDataDir;
const consoleErrors = [];

test.beforeAll(async () => {
  // Isolate from the real user config (and the legacy-migration path).
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-chess-e2e-'));
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
  });
  window = await app.firstWindow();
  window.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('boots in desktop mode with the secure preload bridge', async () => {
  await expect(window).toHaveTitle(/Neural Chess/);
  // The preload runs under sandbox: true — confirm the bridge still mounts.
  const hasBridge = await window.evaluate(() => Boolean(window.neuralChessDesktop));
  expect(hasBridge).toBe(true);
});

test('renders a full chess board', async () => {
  // 64 squares, each an accessible button.
  const squares = window.locator('.board .square');
  await expect(squares).toHaveCount(64);
  await expect(window.getByRole('button', { name: /^e2, white pawn/ })).toBeVisible();
});

test('a configured match accepts a human move', async () => {
  // Fresh profile shows the advisory modal first.
  await window.getByRole('button', { name: 'I UNDERSTAND' }).click();
  // OpenAI preset can start without a local model selected.
  await window.getByRole('button', { name: 'OPENAI' }).click();
  await window.getByRole('button', { name: /INITIALIZE MATCH/ }).click();

  await window.getByRole('button', { name: /^e2, white pawn/ }).click();
  await window.getByRole('button', { name: /^e4, empty/ }).click();

  // The human move registers in the log regardless of what the AI does next.
  await expect(window.locator('.move-history')).toContainText('e4');
});

test('the renderer runs without Content-Security-Policy violations', async () => {
  const cspViolations = consoleErrors.filter((text) =>
    /content security policy|refused to (load|connect|execute)/i.test(text)
  );
  expect(cspViolations, cspViolations.join('\n')).toEqual([]);
});
