/**
 * Login keyring: the data key, wrapped by the login password and, optionally,
 * by Windows Hello (same design as QSSH, docs/ARCHITECTURE.md §11).
 *
 * PURE module (Node `crypto`, hash-wasm, zod; no Electron dependency): tested.
 *
 * The data key is the one that seals `qompta.qdb`, the backups and the exports;
 * its readable form IS the recovery key (`QK1-…`). It never changes: the keyring
 * only decides who may take it out of `qompta.keyring`.
 *
 *  - password wrap: AES-256-GCM under `Argon2id(password, salt)` (64 MiB, 3 passes);
 *  - Hello wrap: AES-256-GCM under `HKDF(signature of a random challenge by the
 *    Windows Hello credential « Qompta »)`. RSA PKCS#1 v1.5 signatures are
 *    deterministic: the same challenge always gives the same signature, which
 *    only Windows Hello (face, fingerprint, PIN) can produce;
 *  - no recovery wrap: the recovery key is the data key itself, checked against
 *    the public `fingerprint` (or by opening the database).
 *
 * Each wrap is authenticated with « qompta/wrap/<kind> »: a wrap cannot be passed
 * off as another kind.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { argon2id } from "hash-wasm";
import { z } from "zod";
import { isStrongPassword } from "../../shared/password.js";
import { keyFingerprint } from "./vault.js";

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Name of the Windows Hello credential (one per Windows account). */
export const HELLO_CREDENTIAL = "Qompta";

const b64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);

const kdfSchema = z.object({
  alg: z.literal("argon2id"),
  memKiB: z.number().int().min(8),
  iterations: z.number().int().min(1),
  parallelism: z.number().int().min(1),
  salt: b64,
});

const sealedSchema = z.object({ nonce: b64, data: b64 });

const wrapSchema = z.discriminatedUnion("kind", [
  sealedSchema.extend({ kind: z.literal("password") }),
  sealedSchema.extend({ kind: z.literal("hello"), challenge: b64, credential: z.string().min(1) }),
]);

const keyringSchema = z.object({
  version: z.literal(1),
  /** Public fingerprint of the data key (first 8 bytes of its SHA-256). */
  fingerprint: b64,
  kdf: kdfSchema,
  wraps: z.array(wrapSchema),
  updatedAt: z.string(),
});

export type KdfParams = z.infer<typeof kdfSchema>;
export type Wrap = z.infer<typeof wrapSchema>;
export type WrapKind = Wrap["kind"];
export type Keyring = z.infer<typeof keyringSchema>;

/** Production parameters (~0.3 s per unlock); tests pass cheaper ones. */
export const DEFAULT_KDF: Omit<KdfParams, "salt"> = {
  alg: "argon2id",
  memKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
};

export class KeyringError extends Error {
  constructor(
    readonly code: "weak-password" | "wrong-password" | "wrong-key" | "corrupt" | "hello-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "KeyringError";
  }
}

// ──────────────────────────────── Primitives ────────────────────────────────

async function derivePasswordKey(password: string, kdf: KdfParams): Promise<Buffer> {
  const out = await argon2id({
    password: password.normalize("NFC"),
    salt: Buffer.from(kdf.salt, "base64"),
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memKiB,
    hashLength: KEY_BYTES,
    outputType: "binary",
  });
  return Buffer.from(out);
}

function deriveHelloKey(signature: Buffer, challenge: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", signature, challenge, "qompta/hello/v1", KEY_BYTES));
}

const wrapAad = (kind: WrapKind): Buffer => Buffer.from(`qompta/wrap/${kind}`, "utf8");

function wrapKey(kek: Buffer, key: Buffer, kind: WrapKind): { nonce: string; data: string } {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", kek, nonce);
  cipher.setAAD(wrapAad(kind));
  const data = Buffer.concat([cipher.update(key), cipher.final(), cipher.getAuthTag()]);
  return { nonce: nonce.toString("base64"), data: data.toString("base64") };
}

/** Returns null when the wrapping key is wrong or the wrap was altered. */
function unwrapKey(kek: Buffer, wrap: Wrap): Buffer | null {
  const nonce = Buffer.from(wrap.nonce, "base64");
  const data = Buffer.from(wrap.data, "base64");
  if (nonce.length !== NONCE_BYTES || data.length < TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", kek, nonce);
    decipher.setAAD(wrapAad(wrap.kind));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    const key = Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]);
    return key.length === KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}

function findWrap<K extends WrapKind>(ring: Keyring, kind: K): Extract<Wrap, { kind: K }> | null {
  return (ring.wraps.find((w) => w.kind === kind) as Extract<Wrap, { kind: K }> | undefined) ?? null;
}

function checkPassword(password: string): void {
  if (!isStrongPassword(password)) {
    throw new KeyringError(
      "weak-password",
      "Mot de passe trop faible : 10 caractères au moins, avec une lettre, un chiffre et un caractère spécial.",
    );
  }
}

// ──────────────────────────────── Keyring ────────────────────────────────

/** Does this key belong to this keyring? (public fingerprint, no decryption) */
export function keyMatches(ring: Keyring, key: Buffer): boolean {
  return Buffer.from(ring.fingerprint, "base64").equals(keyFingerprint(key));
}

/**
 * New keyring protecting `key` with `password`. `keep` carries over the Hello
 * wrap of a previous keyring (password reset with the recovery key): it wraps the
 * same key, so it stays valid.
 */
export async function createKeyring(
  key: Buffer,
  password: string,
  options: { kdf?: Omit<KdfParams, "salt">; keep?: Keyring | null } = {},
): Promise<Keyring> {
  checkPassword(password);
  const kdf: KdfParams = { ...(options.kdf ?? DEFAULT_KDF), salt: randomBytes(16).toString("base64") };
  const passwordKey = await derivePasswordKey(password, kdf);
  const wrap: Wrap = { kind: "password", ...wrapKey(passwordKey, key, "password") };
  passwordKey.fill(0);
  const hello = options.keep && keyMatches(options.keep, key) ? findWrap(options.keep, "hello") : null;
  return {
    version: 1,
    fingerprint: keyFingerprint(key).toString("base64"),
    kdf,
    wraps: hello ? [wrap, hello] : [wrap],
    updatedAt: new Date().toISOString(),
  };
}

/** Data key opened by the password; throws `wrong-password`. */
export async function openWithPassword(ring: Keyring, password: string): Promise<Buffer> {
  const wrap = findWrap(ring, "password");
  if (!wrap) throw new KeyringError("corrupt", "Trousseau sans mot de passe : utilisez la clé de récupération.");
  const passwordKey = await derivePasswordKey(password, ring.kdf);
  const key = unwrapKey(passwordKey, wrap);
  passwordKey.fill(0);
  if (!key || !keyMatches(ring, key)) throw new KeyringError("wrong-password", "Mot de passe incorrect.");
  return key;
}

export function helloEnrolled(ring: Keyring | null): boolean {
  return ring !== null && findWrap(ring, "hello") !== null;
}

/** Challenge that Windows Hello must sign to open the Hello wrap. */
export function helloChallenge(ring: Keyring): Buffer | null {
  const wrap = findWrap(ring, "hello");
  return wrap ? Buffer.from(wrap.challenge, "base64") : null;
}

/** Data key opened by the Hello signature; throws `hello-mismatch`. */
export function openWithHello(ring: Keyring, signature: Buffer): Buffer {
  const wrap = findWrap(ring, "hello");
  if (!wrap) throw new KeyringError("hello-mismatch", "Windows Hello n'est pas activé pour Qompta.");
  const helloKey = deriveHelloKey(signature, Buffer.from(wrap.challenge, "base64"));
  const key = unwrapKey(helloKey, wrap);
  helloKey.fill(0);
  // The Hello credential was reset (new PIN, profile reset): only the password works now.
  if (!key || !keyMatches(ring, key)) {
    throw new KeyringError(
      "hello-mismatch",
      "Windows Hello ne reconnaît plus Qompta (code PIN ou profil réinitialisé). Connectez-vous avec le mot de passe, puis réactivez Windows Hello dans Réglages.",
    );
  }
  return key;
}

/** Adds (or replaces) the Hello wrap, from the signature of a fresh `challenge`. */
export function withHello(ring: Keyring, key: Buffer, challenge: Buffer, signature: Buffer): Keyring {
  if (!keyMatches(ring, key)) throw new KeyringError("wrong-key", "Cette clé n'est pas celle de ce trousseau.");
  const helloKey = deriveHelloKey(signature, challenge);
  const wrap: Wrap = {
    kind: "hello",
    challenge: challenge.toString("base64"),
    credential: HELLO_CREDENTIAL,
    ...wrapKey(helloKey, key, "hello"),
  };
  helloKey.fill(0);
  return {
    ...ring,
    wraps: [...ring.wraps.filter((w) => w.kind !== "hello"), wrap],
    updatedAt: new Date().toISOString(),
  };
}

export function withoutHello(ring: Keyring): Keyring {
  return { ...ring, wraps: ring.wraps.filter((w) => w.kind !== "hello"), updatedAt: new Date().toISOString() };
}

// ──────────────────────────────── Serialization ────────────────────────────────

export function serializeKeyring(ring: Keyring): string {
  return JSON.stringify(ring);
}

export function parseKeyring(text: string): Keyring {
  try {
    return keyringSchema.parse(JSON.parse(text));
  } catch {
    throw new KeyringError("corrupt", "Le trousseau de connexion est illisible.");
  }
}
