/**
 * Keeping the encryption key on the machine.
 *
 * Since v1.21.0 the key only lives in `qompta.keyring`, wrapped by the login
 * password (and Windows Hello if enabled, see `keyring.ts`): without them it
 * cannot be taken out. The file is also sealed by `safeStorage` (DPAPI on
 * Windows, keychain on macOS) when the system offers it, so a copy of it taken
 * off the machine cannot even be attacked by guessing the password. Elsewhere it
 * is stored with the `QKRING:` prefix, still protected by the password.
 *
 * `qompta.key` (up to v1.20.x) held the bare key, protected by DPAPI only: any
 * program of the session could open the data. It is read once to migrate (the
 * user chooses a password) and then deleted. An older Qompta launched afterwards
 * may write it again: it is deleted at every start while a keyring exists.
 */

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import { parseKeyring, serializeKeyring, type Keyring } from "./keyring.js";

export const KEYRING_FILE = "qompta.keyring";
export const LEGACY_KEY_FILE = "qompta.key";
const PLAIN_PREFIX = Buffer.from("QKPLAIN:", "ascii");
const RING_PREFIX = Buffer.from("QKRING:", "ascii");

function path(file: string): string {
  return join(app.getPath("userData"), file);
}

/** Does the system protect the keyring file (DPAPI / keychain)? */
export function keyIsProtected(): boolean {
  return safeStorage.isEncryptionAvailable();
}

// ───────────────────────────── Keyring (v1.21+) ─────────────────────────────

export function hasKeyring(): boolean {
  return existsSync(path(KEYRING_FILE));
}

export function loadKeyring(): Keyring {
  const raw = readFileSync(path(KEYRING_FILE));
  const text = raw.subarray(0, RING_PREFIX.length).equals(RING_PREFIX)
    ? raw.subarray(RING_PREFIX.length).toString("utf8")
    : safeStorage.decryptString(raw);
  return parseKeyring(text);
}

export function storeKeyring(ring: Keyring): void {
  const text = serializeKeyring(ring);
  const data = keyIsProtected()
    ? safeStorage.encryptString(text)
    : Buffer.concat([RING_PREFIX, Buffer.from(text, "utf8")]);
  const target = path(KEYRING_FILE);
  writeFileSync(`${target}.tmp`, data);
  renameSync(`${target}.tmp`, target);
}

// ───────────────────────────── Bare key (<= v1.20) ─────────────────────────────

export function hasLegacyKey(): boolean {
  return existsSync(path(LEGACY_KEY_FILE));
}

export function loadLegacyKey(): Buffer {
  const raw = readFileSync(path(LEGACY_KEY_FILE));
  if (raw.subarray(0, PLAIN_PREFIX.length).equals(PLAIN_PREFIX)) {
    return Buffer.from(raw.subarray(PLAIN_PREFIX.length).toString("ascii"), "base64");
  }
  return Buffer.from(safeStorage.decryptString(raw), "base64");
}

export function removeLegacyKey(): void {
  rmSync(path(LEGACY_KEY_FILE), { force: true });
}

/** Sets the key files aside (lost key: start over), without deleting them. */
export function setAsideKeyFiles(suffix: string): void {
  for (const file of [KEYRING_FILE, LEGACY_KEY_FILE]) {
    const p = path(file);
    if (existsSync(p)) renameSync(p, `${p}.${suffix}`);
  }
}
