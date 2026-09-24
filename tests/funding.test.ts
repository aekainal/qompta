/**
 * Fund contributions: aggregates, cash position, isolation, and above all the
 * guarantee that a contribution NEVER enters the VAT return.
 */

import { describe, expect, it } from "vitest";
import {
  buildCashPosition,
  summarizeFunding,
  type CashInvoice,
  type FundContribution,
} from "../src/shared/funding.js";
import type { CashReconciliation } from "../src/shared/cashReconciliation.js";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createAssociatesRepo } from "../src/db/repositories/associates.repo.js";
import { createFundContributionsRepo } from "../src/db/repositories/fundContributions.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createVatReturnsRepo } from "../src/db/repositories/vatReturns.repo.js";
import { createTestDb } from "./helpers/test-db.js";

function row(over: Partial<FundContribution>): FundContribution {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    companyId: "c1",
    associateId: "a1",
    associateName: "Associé A",
    date: "2026-01-10",
    kind: "capital",
    amount: 100000,
    method: "bank",
    bankAccountId: null,
    reference: null,
    notes: null,
    createdAt: "2026-01-10T10:00:00.000Z",
    ...over,
  };
}

describe("summarizeFunding", () => {
  it("sépare capital, compte courant et remboursements", () => {
    const s = summarizeFunding([
      row({ kind: "capital", amount: 600000 }),
      row({ kind: "current_account", amount: 250000 }),
      row({ kind: "repayment", amount: 100000 }),
    ]);

    expect(s.capital).toBe(600000);
    expect(s.currentAccount).toBe(250000);
    expect(s.repaid).toBe(100000);
    // Net money in: 6000 + 2500 − 1000
    expect(s.net).toBe(750000);
    // Remaining debt to the shareholder: only the loan account is repayable.
    expect(s.owedToAssociates).toBe(150000);
    expect(s.count).toBe(3);
  });

  it("regroupe par associé et trie du plus engagé au moins engagé", () => {
    const s = summarizeFunding([
      row({ associateId: "a1", associateName: "A", kind: "capital", amount: 200000 }),
      row({ associateId: "a2", associateName: "B", kind: "capital", amount: 400000 }),
      row({ associateId: "a1", associateName: "A", kind: "repayment", amount: 50000 }),
    ]);

    expect(s.byAssociate.map((a) => a.name)).toEqual(["B", "A"]);
    expect(s.byAssociate[1]).toMatchObject({ capital: 200000, repaid: 50000, net: 150000 });
  });

  it("regroupe par nom quand l'associé a été supprimé (associateId null)", () => {
    const s = summarizeFunding([
      row({ associateId: null, associateName: "Ancien associé", amount: 100000 }),
      row({ associateId: null, associateName: "Ancien associé", amount: 50000 }),
    ]);
    expect(s.byAssociate).toHaveLength(1);
    expect(s.byAssociate[0].net).toBe(150000);
  });

  it("ne compte que les mouvements jusqu'à la date demandée", () => {
    const s = summarizeFunding(
      [row({ date: "2026-01-10", amount: 100000 }), row({ date: "2027-01-10", amount: 900000 })],
      "2026-12-31",
    );
    expect(s.net).toBe(100000);
  });

  it("renvoie des totaux nuls sans mouvement", () => {
    expect(summarizeFunding([])).toMatchObject({ net: 0, count: 0, byAssociate: [] });
  });
});

describe("buildCashPosition", () => {
  const invoices: CashInvoice[] = [
    { type: "sale", status: "paid", issueDate: "2026-02-01", paymentDate: "2026-02-20", amountTtc: 108100 },
    { type: "sale", status: "issued", issueDate: "2026-03-01", paymentDate: null, amountTtc: 500000 },
    { type: "purchase", status: "paid", issueDate: "2026-01-15", paymentDate: "2026-01-20", amountTtc: 32430 },
    { type: "purchase", status: "issued", issueDate: "2026-03-05", paymentDate: null, amountTtc: 21620 },
    { type: "purchase", status: "draft", issueDate: "2026-03-06", paymentDate: null, amountTtc: 99999 },
  ];

  it("additionne apports et encaissements, retranche les paiements", () => {
    const cash = buildCashPosition([row({ kind: "capital", amount: 1000000 })], invoices);

    expect(cash.funding).toBe(1000000);
    expect(cash.collected).toBe(108100);
    expect(cash.spent).toBe(32430);
    expect(cash.available).toBe(1000000 + 108100 - 32430);
    // Issued unsettled purchases only: a draft commits to nothing.
    expect(cash.toPay).toBe(21620);
  });

  it("« Réglé (pour TVA) » ne touche pas la trésorerie (ni dépense ni dette)", () => {
    const cash = buildCashPosition(
      [],
      [
        { type: "purchase", status: "settled_vat", issueDate: "2026-02-01", paymentDate: null, amountTtc: 54050 },
      ],
    );
    expect(cash.spent).toBe(0); // not a cash outflow of the company
    expect(cash.toPay).toBe(0); // already paid by a third party: not a debt to pay
    expect(cash.available).toBe(0);
  });

  it("un pointage recale la trésorerie : seuls les flux postérieurs comptent", () => {
    const invoices: CashInvoice[] = [
      // Before the reconciliation: already in the actual balance → ignored.
      { type: "sale", status: "paid", issueDate: "2026-01-10", paymentDate: "2026-01-15", amountTtc: 500000 },
      { type: "purchase", status: "paid", issueDate: "2026-02-01", paymentDate: "2026-02-05", amountTtc: 200000 },
      // After the reconciliation: added to the balance.
      { type: "sale", status: "paid", issueDate: "2026-08-01", paymentDate: "2026-08-10", amountTtc: 300000 },
      { type: "purchase", status: "paid", issueDate: "2026-08-15", paymentDate: "2026-08-20", amountTtc: 100000 },
    ];
    const recs: CashReconciliation[] = [
      { id: "r1", companyId: "c1", date: "2026-07-25", balance: 12578, note: null, createdAt: "2026-07-25T10:00:00.000Z" },
    ];
    const cash = buildCashPosition([], invoices, "2026-12-31", recs);
    expect(cash.available).toBe(12578 + 300000 - 100000); // 125.78 + 3000 − 1000
    expect(cash.reconciledOn).toBe("2026-07-25");
    expect(cash.reconciledBalance).toBe(12578);
  });

  it("une écriture antérieure au pointage ne bouge pas la trésorerie recalée", () => {
    const recs: CashReconciliation[] = [
      { id: "r1", companyId: "c1", date: "2026-07-25", balance: 12578, note: null, createdAt: "2026-07-25T10:00:00.000Z" },
    ];
    const oldPurchase: CashInvoice[] = [
      { type: "purchase", status: "paid", issueDate: "2026-03-01", paymentDate: "2026-03-02", amountTtc: 99999 },
    ];
    const after = buildCashPosition([], oldPurchase, "2026-12-31", recs);
    expect(after.available).toBe(12578); // purchase predates the reconciliation: no effect
  });

  it("permet de payer les premières factures avant tout encaissement", () => {
    const firstBills: CashInvoice[] = [
      { type: "purchase", status: "issued", issueDate: "2026-01-08", paymentDate: null, amountTtc: 250000 },
    ];
    const withoutFunding = buildCashPosition([], firstBills);
    const withFunding = buildCashPosition([row({ kind: "capital", amount: 500000 })], firstBills);

    expect(withoutFunding.available).toBe(0);
    expect(withoutFunding.available < withoutFunding.toPay).toBe(true);
    expect(withFunding.available).toBe(500000);
    expect(withFunding.available >= withFunding.toPay).toBe(true);
  });

  it("un décompte TVA payé retire la TVA nette de la trésorerie", () => {
    const invoices: CashInvoice[] = [
      { type: "sale", status: "paid", issueDate: "2026-02-01", paymentDate: "2026-02-10", amountTtc: 108100 },
    ];
    const cash = buildCashPosition([], invoices, "2026-12-31", [], [{ date: "2026-04-30", amount: 8100 }]);
    expect(cash.collected).toBe(108100);
    expect(cash.available).toBe(108100 - 8100); // net VAT paid to the FTA removed
  });

  it("un remboursement TVA (crédit) entre en trésorerie", () => {
    const cash = buildCashPosition([], [], "2026-12-31", [], [{ date: "2026-04-30", amount: -5000 }]);
    expect(cash.available).toBe(5000);
  });

  it("coupe à la date demandée, paiement d'abord puis émission", () => {
    const cash = buildCashPosition(
      [row({ date: "2026-01-05", amount: 100000 })],
      [{ type: "sale", status: "paid", issueDate: "2026-12-20", paymentDate: "2027-01-15", amountTtc: 200000 }],
      "2026-12-31",
    );
    expect(cash.collected).toBe(0);
    expect(cash.available).toBe(100000);
  });
});

describe("repository des entrées de fonds", () => {
  it("isole par société et fige le nom de l'associé", () => {
    const db = createTestDb();
    const companies = createCompaniesRepo(db);
    const associatesRepo = createAssociatesRepo(db);
    const funding = createFundContributionsRepo(db);

    const alpha = companies.create({ name: "Alpha SS", legalForm: "societe_simple" });
    const beta = companies.create({ name: "Beta SS", legalForm: "societe_simple" });
    const a = associatesRepo.create(alpha.id, { name: "Associé A", shareBps: 10000 });

    // The entered name is ignored in favour of the shareholder's real name.
    funding.create(alpha.id, {
      associateId: a.id,
      associateName: "orthographe approximative",
      date: "2026-01-05",
      kind: "capital",
      amount: 500000,
    });
    funding.create(beta.id, {
      associateId: null,
      associateName: "Associé B",
      date: "2026-01-05",
      kind: "current_account",
      amount: 100000,
    });

    expect(funding.list(alpha.id)).toHaveLength(1);
    expect(funding.list(alpha.id)[0].associateName).toBe("Associé A");
    expect(funding.list(beta.id)).toHaveLength(1);
    expect(funding.list(beta.id)[0].companyId).toBe(beta.id);
  });

  it("survit à la suppression de l'associé (historique conservé)", () => {
    const db = createTestDb();
    const companies = createCompaniesRepo(db);
    const associatesRepo = createAssociatesRepo(db);
    const funding = createFundContributionsRepo(db);

    const c = companies.create({ name: "Gamma SS", legalForm: "societe_simple" });
    const a = associatesRepo.create(c.id, { name: "Partant", shareBps: 10000 });
    funding.create(c.id, {
      associateId: a.id,
      associateName: "Partant",
      date: "2026-01-05",
      kind: "capital",
      amount: 300000,
    });

    associatesRepo.remove(c.id, a.id);

    const rows = funding.list(c.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].associateId).toBeNull();
    expect(rows[0].associateName).toBe("Partant");
  });

  it("liste du plus récent au plus ancien, et se modifie", () => {
    const db = createTestDb();
    const companies = createCompaniesRepo(db);
    const funding = createFundContributionsRepo(db);
    const c = companies.create({ name: "Delta SS", legalForm: "societe_simple" });

    const old = funding.create(c.id, { associateName: "A", date: "2026-01-05", kind: "capital", amount: 100000 });
    funding.create(c.id, { associateName: "A", date: "2026-06-05", kind: "capital", amount: 200000 });

    expect(funding.list(c.id).map((r) => r.date)).toEqual(["2026-06-05", "2026-01-05"]);

    const updated = funding.update(c.id, old.id, {
      associateName: "A",
      date: "2026-01-05",
      kind: "current_account",
      amount: 150000,
      reference: "Virement janvier",
    });
    expect(updated).toMatchObject({ kind: "current_account", amount: 150000, reference: "Virement janvier" });

    funding.remove(c.id, old.id);
    expect(funding.list(c.id)).toHaveLength(1);
  });
});

describe("les apports restent hors du décompte TVA", () => {
  it("un apport ne change aucun chiffre du décompte", () => {
    const db = createTestDb();
    const companies = createCompaniesRepo(db);
    const invoicesRepo = createInvoicesRepo(db);
    const vat = createVatReturnsRepo(db);
    const funding = createFundContributionsRepo(db);

    const c = companies.create({ name: "Epsilon Sàrl", legalForm: "sarl" });
    invoicesRepo.create(c.id, {
      type: "sale",
      issueDate: "2026-02-10",
      treatment: "standard",
      rate: "normal",
      enteredAs: "ht",
      enteredAmount: 1000000,
      status: "issued",
    });

    const before = vat.computeLive(c.id, "annual", 2026, null).result;
    funding.create(c.id, {
      associateName: "Fondateur",
      date: "2026-02-11",
      kind: "capital",
      amount: 5000000,
    });
    const after = vat.computeLive(c.id, "annual", 2026, null).result;

    expect(after).toEqual(before);
  });
});
