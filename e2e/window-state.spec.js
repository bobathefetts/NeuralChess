import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('window size persists across launches', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-chess-win-'));
  try {
    // First launch: resize the window to a known, on-screen geometry.
    const app1 = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`] });
    const win1 = await app1.firstWindow();
    await win1.waitForLoadState('domcontentloaded');
    await app1.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.unmaximize();
      w.setBounds({ x: 80, y: 60, width: 1180, height: 920 });
    });
    // Let the debounced save (400ms) flush before closing.
    await win1.waitForTimeout(700);
    await app1.close();

    // Second launch: the window should reopen at the saved size.
    const app2 = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`] });
    const win2 = await app2.firstWindow();
    await win2.waitForLoadState('domcontentloaded');
    const bounds = await app2.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds()
    );
    await app2.close();

    expect(bounds.width).toBe(1180);
    expect(bounds.height).toBe(920);
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
