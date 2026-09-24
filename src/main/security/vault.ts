/**
 * Qompta encrypted vault: format of the `.qdb` (application database),
 * `.qbak` (full backups) and `.qexp` (company exports) files.
 *
 * PURE module (Node `crypto` + `zlib`, no Electron dependency): tested.
 *
 * Format of a sealed file:
 *
 *   ┌────────┬─────────┬──────┬──────────────┬──────┬──────┬───────────────────┐
 *   │ "QMPT" │ version │ kind │ fingerprint  │  IV  │ tag  │ encrypted payload │
 *   │  4 B   │   1 B   │ 1 B  │     8 B      │ 12 B │ 16 B │  gzip(payload)    │
 *   └────────┴─────────┴──────┴──────────────┴──────┴──────┴───────────────────┘
 *
 * AES-256-GCM, the whole header (tag excluded) serves as authenticated data: one
 * can neither change the kind of a file nor graft the fingerprint of another key
 * without opening failing. The fingerprint (first 8 bytes of the SHA-256 of the
 * key) reveals nothing about the key; it only allows saying « this file was
 * encrypted with ANOTHER key » instead of a terse « corrupt file ».
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("QMPT", "ascii");
const VERSION = 1;
const HEADER_LEN = 4 + 1 + 1 + 8 + 12; // before the tag
const TAG_LEN = 16;

/** Content of a sealed file. */
export type VaultKind = "database" | "export";
const KIND_CODE: Record<VaultKind, number> = { database: 1, export: 2 };

export type VaultErrorCode = "not-a-vault" | "wrong-key" | "corrupt" | "unsupported";

export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

/** New encryption key: 256 random bits. */
export function generateKey(): Buffer {
  return randomBytes(32);
}

/** Public fingerprint of a key (8 bytes). */
export function keyFingerprint(key: Buffer): Buffer {
  return createHash("sha256").update(key).digest().subarray(0, 8);
}

// ───────────────────────────── Recovery key (text) ─────────────────────────────

/**
 * Crockford base32 alphabet: no I, L, O nor U — nothing that can be confused
 * when reading back a key copied out by hand.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Key → text to write down: `QK1-` then 52 characters in groups of 4.
 * E.g. `QK1-7F3K-9QZC-…` (13 groups).
 */
export function formatRecoveryKey(key: Buffer): string {
  if (key.length !== 32) throw new Error("Une clé Qompta fait 32 octets.");
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of key) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return "QK1-" + out.match(/.{1,4}/g)!.join("-");
}

/**
 * Entered text → key, or `null` if it cannot be read. Lenient: case, spaces,
 * dashes, and the usual confusions (O→0, I/L→1) are accepted.
 */
export function parseRecoveryKey(text: string): Buffer | null {
  let cleaned = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  // The « QK1 » prefix is optional; it is recognized by the length (52 + 3).
  if (cleaned.length === 55 && cleaned.startsWith("QK1")) cleaned = cleaned.slice(3);
  if (cleaned.length !== 52) return null;
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return bytes.length >= 32 ? Buffer.from(bytes.slice(0, 32)) : null;
}

// ──────────────────────────────── Seal ────────────────────────────────

/** Encrypts `payload` (compressed along the way). */
export function seal(payload: Buffer, key: Buffer, kind: VaultKind): Buffer {
  const iv = randomBytes(12);
  const header = Buffer.concat([
    MAGIC,
    Buffer.from([VERSION, KIND_CODE[kind]]),
    keyFingerprint(key),
    iv,
  ]);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(gzipSync(payload)), cipher.final()]);
  return Buffer.concat([header, cipher.getAuthTag(), body]);
}

/** Is the file in the Qompta encrypted format? */
export function isVault(file: Buffer): boolean {
  return file.length >= HEADER_LEN + TAG_LEN && file.subarray(0, 4).equals(MAGIC);
}

/** Reads the header without decrypting: kind of content and key fingerprint. */
export function peek(file: Buffer): { kind: VaultKind; fingerprint: Buffer } {
  if (!isVault(file)) {
    throw new VaultError("not-a-vault", "Ce fichier n'est pas une sauvegarde Qompta chiffrée.");
  }
  if (file[4] !== VERSION) {
    throw new VaultError(
      "unsupported",
      "Ce fichier vient d'une version plus récente de Qompta : mettez l'application à jour.",
    );
  }
  const kind = (Object.keys(KIND_CODE) as VaultKind[]).find((k) => KIND_CODE[k] === file[5]);
  if (!kind) throw new VaultError("corrupt", "Type de fichier Qompta inconnu.");
  return { kind, fingerprint: file.subarray(6, 14) };
}

/** Is the key the one that encrypted this file? (without decrypting) */
export function isSealedWith(file: Buffer, key: Buffer): boolean {
  return peek(file).fingerprint.equals(keyFingerprint(key));
}

/** Decrypts a sealed file. Throws an explicit `VaultError` on failure. */
export function unseal(file: Buffer, key: Buffer): { kind: VaultKind; payload: Buffer } {
  const { kind, fingerprint } = peek(file);
  if (!fingerprint.equals(keyFingerprint(key))) {
    throw new VaultError(
      "wrong-key",
      "Ce fichier a été chiffré avec une autre clé : saisissez la clé de récupération d'origine.",
    );
  }
  const header = file.subarray(0, HEADER_LEN);
  const iv = file.subarray(14, HEADER_LEN);
  const tag = file.subarray(HEADER_LEN, HEADER_LEN + TAG_LEN);
  const body = file.subarray(HEADER_LEN + TAG_LEN);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    const zipped = Buffer.concat([decipher.update(body), decipher.final()]);
    return { kind, payload: gunzipSync(zipped) };
  } catch {
    throw new VaultError("corrupt", "Le fichier est endommagé ou a été modifié : impossible de le déchiffrer.");
  }
}

/** Signature of a plain SQLite file (legacy `.sqlite` backups). */
export function isPlainSqlite(file: Buffer): boolean {
  return file.subarray(0, 16).toString("latin1") === "SQLite format 3\u0000";
}
