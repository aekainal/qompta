/**
 * Repository of the global application settings (JSON key/value).
 */

import { eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { appSettings } from "../schema.js";

export function createSettingsRepo(db: DB) {
  return {
    get<T>(key: string): T | null {
      const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
      return row ? (JSON.parse(row.value) as T) : null;
    },

    set<T>(key: string, value: T): void {
      const json = JSON.stringify(value);
      const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
      if (existing) {
        db.update(appSettings).set({ value: json }).where(eq(appSettings.key, key)).run();
      } else {
        db.insert(appSettings).values({ key, value: json }).run();
      }
    },

    delete(key: string): void {
      db.delete(appSettings).where(eq(appSettings.key, key)).run();
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
