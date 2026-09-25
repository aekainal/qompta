#!/usr/bin/env node
/**
 * Restarts the development application.
 *
 * Useful after a version bump: the number shown in the sidebar comes from
 * `__APP_VERSION__`, frozen by electron-vite when the server starts. Without a
 * restart, the app keeps showing the old version; hot reloading is not
 * enough.
 *
 * The script runs the whole cycle:
 *  1. closes the running app (it locks the native binary on Windows);
 *  2. puts `better-sqlite3` back on the Electron ABI if it stayed on the Node
 *     ABI (the case after an `npm test`), otherwise the app refuses to start;
 *  3. restarts `electron-vite dev`, detached, with a log in /tmp.
 *
 * Usage:
 *   node scripts/restart-app.mjs                    restarts right away
 *   node scripts/restart-app.mjs --if-version-changed   does nothing when the
 *                                                       HEAD version equals HEAD~1's
 *
 * `QOMPTA_NO_RESTART=1` disables the script (handy to chain commits without
 * seeing the window reopen every time).
 */

import { existsSync, openSync, readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";

const NATIVE = "node_modules/better-sqlite3/build/Release/better_sqlite3.node";
const LOG = "/tmp/qompta-dev.log";

/** Running under WSL? The app is then a Windows executable. */
function isWsl() {
  return process.platform === "linux" && (!!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP);
}

/** /mnt/c/Users/... -> C:\Users\... */
function toWindowsPath(p) {
  const m = /^\/mnt\/([a-z])\/(.*)$/i.exec(p);
  return m ? `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}` : null;
}

function quiet(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Version of a commit, or null when it cannot be read. */
function versionAt(ref) {
  const json = quiet(() =>
    execFileSync("git", ["show", `${ref}:package.json`], { encoding: "utf8" }),
  );
  return json ? quiet(() => JSON.parse(json).version) : null;
}

/**
 * Is the native binary on the Electron ABI?
 * On Windows an executable starts with the "MZ" signature; a binary rebuilt for
 * Node under WSL is in ELF format (`\x7fELF`).
 */
function nativeIsWindows() {
  if (!existsSync(NATIVE)) return false;
  const head = readFileSync(NATIVE).subarray(0, 2).toString("latin1");
  return head === "MZ";
}

/** Windows PATH extended with the portable Node 22, when present (see README). */
function windowsPathPrefix() {
  const portable = "C:\\Users\\thomg\\node22";
  return existsSync("/mnt/c/Users/thomg/node22") ? `set PATH=${portable};%PATH% && ` : "";
}

function runInWindows(command, { detached = false } = {}) {
  const winDir = toWindowsPath(process.cwd());
  const full = `cd /d ${winDir} && ${windowsPathPrefix()}${command}`;
  if (!detached) {
    execFileSync("cmd.exe", ["/c", full], { stdio: "inherit" });
    return;
  }
  const out = openSync(LOG, "a");
  spawn("cmd.exe", ["/c", full], { detached: true, stdio: ["ignore", out, out] }).unref();
}

function main() {
  if (process.env.QOMPTA_NO_RESTART === "1") {
    console.log("→ QOMPTA_NO_RESTART=1 : redémarrage ignoré.");
    return;
  }

  if (process.argv.includes("--if-version-changed")) {
    const now = versionAt("HEAD");
    const before = versionAt("HEAD~1");
    if (!now || now === before) {
      console.log(`→ version inchangée (${now ?? "?"}) : pas de redémarrage.`);
      return;
    }
    console.log(`→ version ${before} → ${now} : redémarrage de l'app.`);
  }

  if (!isWsl()) {
    // Native Linux or Windows machine: launch directly.
    const out = openSync(LOG, "a");
    spawn("npx", ["electron-vite", "dev"], { detached: true, stdio: ["ignore", out, out] }).unref();
    console.log(`→ app relancée (journal : ${LOG}).`);
    return;
  }

  // 1. Close the app: as long as it runs, it locks the native binary.
  quiet(() => execFileSync("cmd.exe", ["/c", "taskkill /IM electron.exe /F"], { stdio: "ignore" }));

  // 2. Switch the ABI back if needed (after an npm test it is on the Node ABI).
  if (!nativeIsWindows()) {
    console.log("→ binaire natif en ABI Node : reconstruction pour Electron (une minute)…");
    runInWindows("npx electron-rebuild -f -o better-sqlite3");
  }

  // 3. Restart, detached: the script hands back control right away.
  runInWindows("npx electron-vite dev", { detached: true });
  console.log(`→ app relancée (journal : ${LOG}).`);
}

main();
