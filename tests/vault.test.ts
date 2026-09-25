/**
 * Encrypted vault: .qdb / .qbak / .qexp file format and recovery key.
 */

import { describe, expect, it } from "vitest";
import {
  VaultError,
  formatRecoveryKey,
  generateKey,
  isPlainSqlite,
  isSealedWith,
  isVault,
  parseRecoveryKey,
  peek,
  seal,
  unseal,
} from "../src/main/security/vault.js";

const SECRET = Buffer.from("Facture FC2026072201 · 1'234.50 CHF · Client Confidentiel SA", "utf8");

describe("coffre : scellement", () => {
  it("rend exactement ce qui a été scellé, et rien n'est lisible en clair", () => {
    const key = generateKey();
    const file = seal(SECRET, key, "database");
    expect(isVault(file)).toBe(true);
    expect(file.includes(Buffer.from("Confidentiel"))).toBe(false);
    const opened = unseal(file, key);
    expect(opened.kind).toBe("database");
    expect(opened.payload.equals(SECRET)).toBe(true);
  });

  it("garde le type de contenu dans l'en-tête", () => {
    const key = generateKey();
    expect(peek(seal(SECRET, key, "export")).kind).toBe("export");
    expect(unseal(seal(SECRET, key, "export"), key).kind).toBe("export");
  });

  it("refuse une autre clé avec un message explicite, sans tenter de déchiffrer", () => {
    const file = seal(SECRET, generateKey(), "database");
    const other = generateKey();
    expect(isSealedWith(file, other)).toBe(false);
    expect(() => unseal(file, other)).toThrowError(VaultError);
    try {
      unseal(file, other);
    } catch (e) {
      expect((e as VaultError).code).toBe("wrong-key");
    }
  });

  it("détecte un fichier modifié (authentification GCM)", () => {
    const key = generateKey();
    const file = seal(SECRET, key, "database");
    const tampered = Buffer.from(file);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => unseal(tampered, key)).toThrow(/endommagé|modifié/);
    // Changing the type in the header breaks the authentication too.
    const retyped = Buffer.from(file);
    retyped[5] = 2;
    expect(() => unseal(retyped, key)).toThrow(VaultError);
  });

  it("chaque scellement est unique (IV aléatoire)", () => {
    const key = generateKey();
    expect(seal(SECRET, key, "database").equals(seal(SECRET, key, "database"))).toBe(false);
  });

  it("reconnaît un fichier qui n'est pas un coffre, et une base SQLite en clair", () => {
    expect(isVault(Buffer.from("SQLite format 3\u0000 et la suite"))).toBe(false);
    expect(isPlainSqlite(Buffer.from("SQLite format 3\u0000 et la suite"))).toBe(true);
    expect(() => peek(Buffer.from("n'importe quoi"))).toThrow(/pas une sauvegarde/);
  });
});

describe("coffre : clé de récupération", () => {
  it("s'écrit QK1- + 13 groupes de 4 et se relit à l'identique", () => {
    const key = generateKey();
    const text = formatRecoveryKey(key);
    expect(text).toMatch(/^QK1(-[0-9A-HJKMNP-TV-Z]{4}){13}$/);
    expect(parseRecoveryKey(text)!.equals(key)).toBe(true);
  });

  it("tolère casse, espaces, tirets absents et confusions O/0, I/L/1", () => {
    const key = generateKey();
    const text = formatRecoveryKey(key);
    const sloppy = text.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l");
    expect(parseRecoveryKey(sloppy)!.equals(key)).toBe(true);
    expect(parseRecoveryKey(text.replace(/^QK1-/, ""))!.equals(key)).toBe(true);
  });

  it("refuse une clé tronquée ou avec des caractères hors alphabet", () => {
    const text = formatRecoveryKey(generateKey());
    expect(parseRecoveryKey(text.slice(0, -2))).toBeNull();
    expect(parseRecoveryKey(text.slice(0, -1) + "U")).toBeNull();
    expect(parseRecoveryKey("")).toBeNull();
  });
});
