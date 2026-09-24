/**
 * Automatic backups: file naming and retention.
 * PURE module, tested (`tests/backups.test.ts`).
 *
 * An automatic backup is named `Qompta_AAAA-MM-JJ_HH-mm-ss.qbak`. Retention
 * touches ONLY the files that match this pattern exactly: the folder may be
 * shared with other documents, nothing else is ever deleted there.
 */

/** Extension of the encrypted full backups. */
export const BACKUP_EXT = ".qbak";
/** Extension of the encrypted company exports. */
export const EXPORT_EXT = ".qexp";

export const DEFAULT_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 3650;

const NAME_RE = /^Qompta_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_[\w-]+)?\.qbak$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Name of a backup taken at `date` (local time). `tag` marks the special cases. */
export function backupFileName(date: Date, tag?: string): string {
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Qompta_${stamp}${tag ? `_${tag}` : ""}${BACKUP_EXT}`;
}

/** Date of a backup from its name, or `null` if it is not a Qompta backup. */
export function backupDate(fileName: string): Date | null {
  const m = NAME_RE.exec(fileName);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

/** Clamps an entered retention duration. */
export function clampRetentionDays(days: unknown): number {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RETENTION_DAYS;
  return Math.min(n, MAX_RETENTION_DAYS);
}

/**
 * Files to delete: Qompta backups older than `days` days.
 * The most recent one is always kept, even past the limit — a machine left off
 * for a month must not end up with no backup at all.
 */
export function backupsToPrune(fileNames: string[], now: Date, days: number): string[] {
  const dated = fileNames
    .map((name) => ({ name, date: backupDate(name) }))
    .filter((f): f is { name: string; date: Date } => f.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const limit = now.getTime() - clampRetentionDays(days) * 24 * 3600 * 1000;
  return dated.slice(1).filter((f) => f.date.getTime() < limit).map((f) => f.name);
}

/** Automatic backup settings, as shown in the Settings screen. */
export interface BackupConfig {
  /** Folder of the automatic backups. */
  dir: string;
  /** Folder proposed by default (Documents\Qompta\Sauvegardes). */
  defaultDir: string;
  retentionDays: number;
  /** Last successful backup. */
  last: { at: string; file: string; size: number } | null;
  /** Last failure, cleared on the next success. */
  lastError: string | null;
}

export interface BackupEntry {
  file: string;
  path: string;
  /** ISO date, derived from the name. */
  at: string;
  size: number;
}
