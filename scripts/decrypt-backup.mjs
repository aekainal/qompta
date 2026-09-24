#!/usr/bin/env node
/**
 * Decrypts a Qompta file OUTSIDE the application — fallback plan.
 *
 *   node scripts/decrypt-backup.mjs <fichier.qbak|.qexp|.qdb> <clé QK1-…> [sortie]
 *
 * Produces a SQLite database (`.sqlite`, backups and database — rebuilt with the
 * project's better-sqlite3, on the Node ABI: `npm run rebuild:node` if needed) or a JSON
 * (`.json`, company exports), readable by any tool. The result is IN CLEAR TEXT:
 * delete it once the recovery is done.
 *
 * Same format as `src/main/security/vault.ts` and `src/db/dump.ts`, deliberately
 * rewritten here: the script depends only on Node (and on better-sqlite3 for a database).
 */

import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function parseKey(text) {
  let s = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length === 55 && s.startsWith("QK1")) s = s.slice(3);
  if (s.length !== 52) return null;
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes.slice(0, 32));
}

const [, , input, keyText, output] = process.argv;
if (!input || !keyText) {
  console.error("Usage : node scripts/decrypt-backup.mjs <fichier> <clé QK1-…> [sortie]");
  process.exit(1);
}

const key = parseKey(keyText);
if (!key) {
  console.error("Clé illisible (attendu : QK1- suivi de 13 groupes de 4 caractères).");
  process.exit(1);
}

const file = readFileSync(input);
if (file.subarray(0, 4).toString("ascii") !== "QMPT") {
  console.error("Ce fichier n'est pas un fichier Qompta chiffré.");
  process.exit(1);
}
const kind = file[5] === 2 ? "export" : "database";
const fingerprint = createHash("sha256").update(key).digest().subarray(0, 8);
if (!file.subarray(6, 14).equals(fingerprint)) {
  console.error("Cette clé n'est pas celle qui a chiffré ce fichier.");
  process.exit(1);
}

const header = file.subarray(0, 26);
const decipher = createDecipheriv("aes-256-gcm", key, file.subarray(14, 26));
decipher.setAAD(header);
decipher.setAuthTag(file.subarray(26, 42));
let payload;
try {
  payload = gunzipSync(Buffer.concat([decipher.update(file.subarray(42)), decipher.final()]));
} catch {
  console.error("Fichier endommagé ou modifié : déchiffrement impossible.");
  process.exit(1);
}

if (kind === "export") {
  const out = output ?? input.replace(/\.\w+$/, ".json");
  writeFileSync(out, payload);
  done(out);
} else {
  // A database is stored as a logical copy (schema + rows): it is replayed here
  // into a real SQLite file.
  const out = output ?? input.replace(/\.\w+$/, ".sqlite");
  const dump = JSON.parse(payload.toString("utf8"));
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(out);
  const q = (n) => `"${n.replace(/"/g, '""')}"`;
  db.transaction(() => {
    for (const sql of dump.schema) db.exec(sql);
    for (const [name, { columns, rows }] of Object.entries(dump.tables)) {
      if (!rows.length) continue;
      const ins = db.prepare(`INSERT INTO ${q(name)} (${columns.map(q).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
      for (const r of rows) ins.run(...r.map((v) => (v && typeof v === "object" ? Buffer.from(v.$b, "base64") : v)));
    }
  })();
  db.close();
  done(out);
}

function done(out) {
  console.log(`Déchiffré (${kind}) → ${out}`);
  console.log("ATTENTION : ce fichier est en clair. Supprimez-le après usage.");
}
