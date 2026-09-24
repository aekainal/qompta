/**
 * Controls of the frameless window. Registered at startup, BEFORE the database
 * is opened: the encryption setup screen also has a title bar.
 */

import { BrowserWindow, ipcMain, screen } from "electron";

// ── Pseudo-maximizing frameless windows (avoids overflow/clipping) ──
const restoreBounds = new WeakMap<BrowserWindow, Electron.Rectangle>();

function workAreaFor(win: BrowserWindow): Electron.Rectangle {
  return screen.getDisplayMatching(win.getBounds()).workArea;
}

/** Does the window fill the work area exactly? */
function isFillingWorkArea(win: BrowserWindow): boolean {
  const b = win.getBounds();
  const wa = workAreaFor(win);
  return b.x === wa.x && b.y === wa.y && b.width === wa.width && b.height === wa.height;
}

function toggleMaximize(win: BrowserWindow): void {
  if (isFillingWorkArea(win)) {
    const r = restoreBounds.get(win);
    if (r) win.setBounds(r);
    else win.unmaximize();
  } else {
    restoreBounds.set(win, win.getBounds());
    win.setBounds(workAreaFor(win));
  }
}

export function registerWindowHandlers(): void {
  // « Maximize » = set exactly the work area (workArea) instead of the native
  // maximize, which overflows the screen on a frameless window and clips top/left.
  ipcMain.handle("window:minimize", (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
    return { ok: true } as const;
  });
  ipcMain.handle("window:toggleMaximize", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return { maximized: false };
    toggleMaximize(win);
    return { maximized: isFillingWorkArea(win) };
  });
  ipcMain.handle("window:close", (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
    return { ok: true } as const;
  });
  ipcMain.handle("window:isMaximized", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return { maximized: win ? isFillingWorkArea(win) : false };
  });
}
