import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

let app;
let window;
let userDataDir;
let mockServer;
const consoleErrors = [];

// Minimal OpenAI-compatible mock that streams back a single legal move, so the
// AI turn exercises the full IPC -> main -> provider -> parser path without
// touching the real network.
function startMockProvider(move) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: move } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test.beforeAll(async () => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-chess-e2e-'));
  mockServer = await startMockProvider('e5');
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}/v1`;

  // Seed the config so the app boots straight into a custom OpenAI-compatible
  // provider pointed at the mock, with the advisory already accepted.
  fs.writeFileSync(
    path.join(userDataDir, 'app-config.json'),
    JSON.stringify({
      version: 2,
      settings: {
        provider: { preset: 'custom', apiType: 'openai', baseUrl, model: 'mock' },
        ui: { playerColor: 'w', squareSize: 72, difficulty: 'normal', disclaimerAccepted: true },
        release: { updateManifestUrl: '' },
      },
      window: { width: 1200, height: 860, x: null, y: null, maximized: false },
      secrets: { apiKey: null },
    })
  );

  app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`] });
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
  await new Promise((resolve) => mockServer?.close(resolve));
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
  const squares = window.locator('.board .square');
  await expect(squares).toHaveCount(64);
  await expect(window.getByRole('button', { name: /^e2, white pawn/ })).toBeVisible();
});

test('a configured match plays the player move and a mocked AI reply', async () => {
  await window.getByRole('button', { name: /INITIALIZE MATCH/ }).click();

  await window.getByRole('button', { name: /^e2, white pawn/ }).click();
  await window.getByRole('button', { name: /^e4, empty/ }).click();

  // Player's e4 and the mock provider's e5 both land — full round trip,
  // no real network.
  await expect(window.locator('.move-history')).toContainText('e4');
  await expect(window.locator('.move-history')).toContainText('e5');
});

test('the renderer runs without Content-Security-Policy violations', async () => {
  const cspViolations = consoleErrors.filter((text) =>
    /content security policy|refused to (load|connect|execute)/i.test(text)
  );
  expect(cspViolations, cspViolations.join('\n')).toEqual([]);
});
