import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Asserts the maximized flag rather than exact pixels: CI runners have a small
// (1024px-wide) display, so a fixed window size would be clamped and a pixel
// assertion would be flaky. Maximized state is display-independent and still
// exercises the full save-on-event / restore-on-launch wiring. Exact size
// round-tripping is covered by the configStore unit test.
test('maximized window state persists across launches', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-chess-win-'));
  try {
    // First launch: maximize the window.
    const app1 = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`] });
    const win1 = await app1.firstWindow();
    await win1.waitForLoadState('domcontentloaded');
    await app1.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    // Let the debounced save (400ms) flush before closing.
    await win1.waitForTimeout(700);
    await app1.close();

    // Second launch: the window should reopen maximized.
    const app2 = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`] });
    const win2 = await app2.firstWindow();
    await win2.waitForLoadState('domcontentloaded');
    await win2.waitForTimeout(300);
    const isMaximized = await app2.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isMaximized()
    );
    await app2.close();

    expect(isMaximized).toBe(true);
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
