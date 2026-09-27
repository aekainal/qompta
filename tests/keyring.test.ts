/**
 * Login keyring: password, Windows Hello and recovery key around the data key.
 */

import { describe, expect, it } from "vitest";
import {
  KeyringError,
  createKeyring,
  helloChallenge,
  helloEnrolled,
  keyMatches,
  openWithHello,
  openWithPassword,
  parseKeyring,
  serializeKeyring,
  withHello,
  withoutHello,
} from "../src/main/security/keyring.js";
import { generateKey } from "../src/main/security/vault.js";
import { isStrongPassword, passwordRules } from "../src/shared/password.js";

// Cheap parameters: the production ones (64 MiB, 3 passes) would slow the suite down.
const KDF = { alg: "argon2id", memKiB: 64, iterations: 1, parallelism: 1 } as const;
const PASSWORD = "Compta-2026!";

describe("mot de passe de connexion : règles", () => {
  it("exige 10 caractères, une lettre, un chiffre et un caractère spécial", () => {
    expect(isStrongPassword(PASSWORD)).toBe(true);
    expect(passwordRules("court1!")).toEqual({ length: false, digit: true, letter: true, special: true });
    expect(isStrongPassword("sanschiffre!!")).toBe(false);
    expect(isStrongPassword("1234567890!!")).toBe(false);
    expect(isStrongPassword("Motdepasse12")).toBe(false);
    expect(isStrongPassword("Élève à 10 ans")).toBe(false);
    expect(isStrongPassword("Élève·à·10ans")).toBe(true);
  });
});

describe("trousseau : mot de passe", () => {
  it("rend la clé au bon mot de passe et à lui seul", async () => {
    const key = generateKey();
    const ring = await createKeyring(key, PASSWORD, { kdf: KDF });
    expect((await openWithPassword(ring, PASSWORD)).equals(key)).toBe(true);
    await expect(openWithPassword(ring, "Compta-2026?")).rejects.toMatchObject({ code: "wrong-password" });
  });

  it("refuse un mot de passe faible avant de chiffrer quoi que ce soit", async () => {
    await expect(createKeyring(generateKey(), "motdepasse", { kdf: KDF })).rejects.toBeInstanceOf(KeyringError);
  });

  it("ne contient la clé ni en clair ni en base64", async () => {
    const key = generateKey();
    const text = serializeKeyring(await createKeyring(key, PASSWORD, { kdf: KDF }));
    expect(text).not.toContain(key.toString("base64"));
    expect(text).not.toContain(key.toString("hex"));
  });

  it("reconnaît sa clé par l'empreinte publique (clé de récupération)", async () => {
    const key = generateKey();
    const ring = await createKeyring(key, PASSWORD, { kdf: KDF });
    expect(keyMatches(ring, key)).toBe(true);
    expect(keyMatches(ring, generateKey())).toBe(false);
  });

  it("survit à la sérialisation et refuse un fichier altéré", async () => {
    const key = generateKey();
    const ring = parseKeyring(serializeKeyring(await createKeyring(key, PASSWORD, { kdf: KDF })));
    expect((await openWithPassword(ring, PASSWORD)).equals(key)).toBe(true);
    expect(() => parseKeyring("{\"version\":2}")).toThrow(KeyringError);

    const wrap = ring.wraps[0]!;
    const data = Buffer.from(wrap.data, "base64");
    data[0] ^= 1;
    const tampered = { ...ring, wraps: [{ ...wrap, data: data.toString("base64") }] };
    await expect(openWithPassword(tampered, PASSWORD)).rejects.toMatchObject({ code: "wrong-password" });
  });
});

describe("trousseau : Windows Hello", () => {
  const challenge = Buffer.alloc(32, 7);
  const signature = Buffer.from("signature RSA déterministe de Windows Hello");

  it("rend la clé à la même signature, pas à une autre", async () => {
    const key = generateKey();
    const ring = withHello(await createKeyring(key, PASSWORD, { kdf: KDF }), key, challenge, signature);
    expect(helloEnrolled(ring)).toBe(true);
    expect(helloChallenge(ring)!.equals(challenge)).toBe(true);
    expect(openWithHello(ring, signature).equals(key)).toBe(true);
    // Credential reset (new PIN): the signature changes, only the password opens.
    expect(() => openWithHello(ring, Buffer.from("autre signature"))).toThrow(KeyringError);
    expect((await openWithPassword(ring, PASSWORD)).equals(key)).toBe(true);
  });

  it("se retire sans toucher au mot de passe", async () => {
    const key = generateKey();
    const ring = withoutHello(withHello(await createKeyring(key, PASSWORD, { kdf: KDF }), key, challenge, signature));
    expect(helloEnrolled(ring)).toBe(false);
    expect(() => openWithHello(ring, signature)).toThrow(KeyringError);
    expect((await openWithPassword(ring, PASSWORD)).equals(key)).toBe(true);
  });

  it("reste actif après un changement de mot de passe (même clé)", async () => {
    const key = generateKey();
    const before = withHello(await createKeyring(key, PASSWORD, { kdf: KDF }), key, challenge, signature);
    const after = await createKeyring(key, "Nouveau-mdp-42", { kdf: KDF, keep: before });
    expect(openWithHello(after, signature).equals(key)).toBe(true);
    await expect(openWithPassword(after, PASSWORD)).rejects.toMatchObject({ code: "wrong-password" });
    expect((await openWithPassword(after, "Nouveau-mdp-42")).equals(key)).toBe(true);
    // A keyring of ANOTHER key does not pass its Hello wrap on.
    const other = await createKeyring(generateKey(), PASSWORD, { kdf: KDF, keep: before });
    expect(helloEnrolled(other)).toBe(false);
  });

  it("refuse d'envelopper une clé qui n'est pas celle du trousseau", async () => {
    const ring = await createKeyring(generateKey(), PASSWORD, { kdf: KDF });
    expect(() => withHello(ring, generateKey(), challenge, signature)).toThrow(KeyringError);
  });
});
