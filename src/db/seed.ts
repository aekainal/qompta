/**
 * Demo data: several companies of different legal forms, with VAT settings,
 * shareholders, chart of accounts and a few invoices.
 *
 * Run: `npm run seed` (creates/overwrites ./qompta-dev.sqlite at the root).
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { sourceMigrationsFolder } from "./migrate.js";
import { createCompaniesRepo } from "./repositories/companies.repo.js";
import { resolveAmounts } from "../shared/money.js";

const DB_PATH = resolve(process.cwd(), "qompta-dev.sqlite");

function addSale(db: ReturnType<typeof drizzle>, companyId: string, netChf: number, rateBps: number, date: string) {
  const { ht, vat, ttc } = resolveAmounts(netChf, "ht", rateBps);
  db.insert(schema.invoices)
    .values({
      id: randomUUID(),
      companyId,
      type: "sale",
      number: `F-${date}-${Math.abs(netChf)}`,
      issueDate: date,
      treatment: "standard",
      enteredAs: "ht",
      amountHt: ht,
      vatRateBps: rateBps,
      vatAmount: vat,
      amountTtc: ttc,
      amountChf: ht,
      vatCode: rateBps === 260 ? "313" : rateBps === 380 ? "343" : "303",
      status: "paid",
      paymentDate: date,
    })
    .run();
}

function addPurchase(db: ReturnType<typeof drizzle>, companyId: string, netChf: number, date: string, investment = false) {
  const { ht, vat, ttc } = resolveAmounts(netChf, "ht", 810);
  db.insert(schema.invoices)
    .values({
      id: randomUUID(),
      companyId,
      type: "purchase",
      issueDate: date,
      treatment: investment ? "input_investment" : "input_material",
      enteredAs: "ht",
      amountHt: ht,
      vatRateBps: 810,
      vatAmount: vat,
      amountTtc: ttc,
      amountChf: ht,
      vatCode: investment ? "405" : "400",
      status: "paid",
      paymentDate: date,
    })
    .run();
}

/** Fund contribution of a shareholder (capital, loan or repayment). */
function addContribution(
  db: ReturnType<typeof drizzle>,
  companyId: string,
  associateId: string,
  associateName: string,
  amount: number,
  kind: "capital" | "current_account" | "repayment",
  date: string,
) {
  db.insert(schema.fundContributions)
    .values({ id: randomUUID(), companyId, associateId, associateName, date, kind, amount, method: "bank" })
    .run();
}

function main() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: sourceMigrationsFolder() });
  const repo = createCompaniesRepo(db);

  // 1) Sole proprietorship
  const ri = repo.create({
    name: "Atelier Dupont (RI)",
    legalForm: "raison_individuelle",
    ideNumber: "CHE-100.200.300",
    rcRegistered: true,
  });
  addSale(db, ri.id, 1_200_00, 810, "2026-01-15");
  addSale(db, ri.id, 800_00, 810, "2026-02-10");
  addPurchase(db, ri.id, 300_00, "2026-01-20");

  // 2) Simple partnership with 2 shareholders (60/40)
  const ss = repo.create({ name: "Studio Léman (SS)", legalForm: "societe_simple" });
  const ssA = randomUUID();
  const ssB = randomUUID();
  db.insert(schema.associates).values([
    { id: ssA, companyId: ss.id, name: "Associé A", shareBps: 6000, fromDate: "2026-01-01" },
    { id: ssB, companyId: ss.id, name: "Associé B", shareBps: 4000, fromDate: "2026-01-01" },
  ]).run();
  // Initial stake of both shareholders: enough to pay the first invoices.
  addContribution(db, ss.id, ssA, "Associé A", 6_000_00, "capital", "2026-01-05");
  addContribution(db, ss.id, ssB, "Associé B", 4_000_00, "capital", "2026-01-05");
  addContribution(db, ss.id, ssA, "Associé A", 2_500_00, "current_account", "2026-02-20");
  addContribution(db, ss.id, ssA, "Associé A", 1_000_00, "repayment", "2026-04-10");
  addSale(db, ss.id, 5_000_00, 810, "2026-03-01");
  addPurchase(db, ss.id, 1_200_00, "2026-03-05");

  // 3) SNC
  const snc = repo.create({ name: "Frères Martin SNC", legalForm: "snc" });
  db.insert(schema.associates).values([
    { id: randomUUID(), companyId: snc.id, name: "Martin Aîné", shareBps: 5000, fromDate: "2026-01-01" },
    { id: randomUUID(), companyId: snc.id, name: "Martin Cadet", shareBps: 5000, fromDate: "2026-01-01" },
  ]).run();
  addSale(db, snc.id, 12_000_00, 810, "2026-02-01");
  addSale(db, snc.id, 3_000_00, 260, "2026-02-15");
  addPurchase(db, snc.id, 4_000_00, "2026-02-20", true);

  // 4) Sàrl with capital
  const sarl = repo.create({
    name: "Helvetia Tech Sàrl",
    legalForm: "sarl",
    ideNumber: "CHE-444.555.666",
    vatNumber: "CHE-444.555.666 TVA",
    shareCapital: 20_000_00,
  });
  db.insert(schema.equityAccounts).values([
    { id: randomUUID(), companyId: sarl.id, kind: "share_capital", label: "Capital social", balance: 20_000_00 },
    { id: randomUUID(), companyId: sarl.id, kind: "legal_reserve", label: "Réserve légale", balance: 2_000_00 },
  ]).run();
  addSale(db, sarl.id, 45_000_00, 810, "2026-01-31");
  addSale(db, sarl.id, 30_000_00, 810, "2026-03-31");
  addPurchase(db, sarl.id, 12_000_00, "2026-02-28");
  addPurchase(db, sarl.id, 8_000_00, "2026-03-15", true);

  // eslint-disable-next-line no-console
  console.log(`Seed terminé : 4 sociétés créées dans ${DB_PATH}`);
  sqlite.close();
}

main();
