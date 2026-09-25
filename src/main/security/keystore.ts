/**
 * Keeping the encryption key on the machine.
 *
 * The key itself is never written in clear: `safeStorage` protects it with the
 * system vault (DPAPI on Windows, keychain on macOS), tied to the user's
 * session. Copying `qompta.key` to another machine is therefore useless: it is
 * the recovery key, written down away from the machine, that allows the data to
 * be reopened elsewhere.
 *
 * Fallback: if the system offers no vault (some Linux without a keyring), the key
 * is stored encoded but unprotected, and the status reports it on screen.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";

const FILE = "qompta.key";
const PLAIN_PREFIX = Buffer.from("QKPLAIN:", "ascii");

function keyPath(): string {
  return join(app.getPath("userData"), FILE);
}

export function hasStoredKey(): boolean {
  return existsSync(keyPath());
}

/** Does the system protect the key (DPAPI / keychain)? */
export function keyIsProtected(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function loadKey(): Buffer | null {
  if (!hasStoredKey()) return null;
  const raw = readFileSync(keyPath());
  if (raw.subarray(0, PLAIN_PREFIX.length).equals(PLAIN_PREFIX)) {
    return Buffer.from(raw.subarray(PLAIN_PREFIX.length).toString("ascii"), "base64");
  }
  return Buffer.from(safeStorage.decryptString(raw), "base64");
}

export function storeKey(key: Buffer): void {
  const encoded = key.toString("base64");
  const data = keyIsProtected()
    ? safeStorage.encryptString(encoded)
    : Buffer.concat([PLAIN_PREFIX, Buffer.from(encoded, "ascii")]);
  const tmp = keyPath() + ".tmp";
  writeFileSync(tmp, data);
  renameSync(tmp, keyPath());
}
