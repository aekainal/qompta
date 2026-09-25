/**
 * Automatic backups: naming and retention.
 */

import { describe, expect, it } from "vitest";
import {
  backupDate,
  backupFileName,
  backupsToPrune,
  clampRetentionDays,
} from "../src/shared/backups.js";

const at = (iso: string) => new Date(iso);

describe("sauvegardes : nommage", () => {
  it("nomme par date et heure locales, et relit la date depuis le nom", () => {
    const d = new Date(2026, 8, 21, 7, 5, 9);
    const name = backupFileName(d);
    expect(name).toBe("Qompta_2026-09-21_07-05-09.qbak");
    expect(backupDate(name)!.getTime()).toBe(d.getTime());
    expect(backupFileName(d, "avant-restauration")).toBe("Qompta_2026-09-21_07-05-09_avant-restauration.qbak");
    expect(backupDate("Qompta_2026-09-21_07-05-09_avant-restauration.qbak")).not.toBeNull();
  });

  it("ignore tout fichier qui ne suit pas le motif", () => {
    for (const other of ["notes.txt", "Qompta_2026-09-21.qbak", "Qompta_2026-09-21_07-05-09.sqlite", "qompta.qdb"]) {
      expect(backupDate(other)).toBeNull();
    }
  });
});

describe("sauvegardes : rétention", () => {
  const now = at("2026-09-21T12:00:00");
  const files = [
    backupFileName(at("2026-09-21T08:00:00")),
    backupFileName(at("2026-09-18T08:00:00")),
    backupFileName(at("2026-09-14T13:00:00")), // 6 d 23 h: kept
    backupFileName(at("2026-09-14T11:00:00")), // 7 d 1 h: deleted
    backupFileName(at("2026-08-01T08:00:00")),
    "compta-perso.xlsx",
    "Qompta_export_toutes_2026-08-01.qexp",
  ];

  it("supprime les sauvegardes Qompta plus vieilles que la rétention, et elles seules", () => {
    expect(backupsToPrune(files, now, 7).sort()).toEqual(
      [backupFileName(at("2026-09-14T11:00:00")), backupFileName(at("2026-08-01T08:00:00"))].sort(),
    );
  });

  it("garde toujours la plus récente, même hors délai", () => {
    const old = [backupFileName(at("2026-01-01T08:00:00")), backupFileName(at("2026-02-01T08:00:00"))];
    expect(backupsToPrune(old, now, 7)).toEqual([old[0]]);
  });

  it("borne une rétention saisie", () => {
    expect(clampRetentionDays(7)).toBe(7);
    expect(clampRetentionDays("30")).toBe(30);
    expect(clampRetentionDays(0)).toBe(7);
    expect(clampRetentionDays(-3)).toBe(7);
    expect(clampRetentionDays("abc")).toBe(7);
    expect(clampRetentionDays(99999)).toBe(3650);
  });
});
