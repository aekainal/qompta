/**
 * Integration tests of quotes and contracts: life cycle, conversion into an
 * invoice, isolation per company, and — the key point — entering the VAT return
 * only after conversion.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createThirdPartiesRepo } from "../src/db/repositories/thirdParties.repo.js";
import { createQuotesRepo } from "../src/db/repositories/quotes.repo.js";
import { createContractsRepo } from "../src/db/repositories/contracts.repo.js";
import { createBankAccountsRepo } from "../src/db/repositories/bankAccounts.repo.js";
import { createVatReturnsRepo } from "../src/db/repositories/vatReturns.repo.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";
import type { DocumentLineInput } from "../src/shared/types.js";
import type { ArticleBlock, ContractBlock } from "../src/shared/documents/contract-blocks.js";

let db: DB;
beforeEach(() => {
  db = createTestDb();
});

/** Sets up the repositories and a company with a customer, ready to use. */
function setup() {
  const companies = createCompaniesRepo(db);
  const invoices = createInvoicesRepo(db);
  const quotes = createQuotesRepo(db, invoices);
  const contracts = createContractsRepo(db);
  const thirdParties = createThirdPartiesRepo(db);
  const banks = createBankAccountsRepo(db);

  const company = companies.create({
    name: "Qwasar Gerber RI",
    legalForm: "raison_individuelle",
    street: "Rue Chautenatte",
    buildingNumber: "19",
    zip: "2720",
    city: "Tramelan",
    email: "contact@qwasar.ch",
  });
  const client = thirdParties.create(company.id, {
    kind: "client",
    name: "YASURAGI",
    zip: "2720",
    city: "Tramelan",
    street: "Rue Albert-Gobat",
    buildingNumber: "2",
  });

  return { companies, invoices, quotes, contracts, thirdParties, banks, company, client };
}

const LINES: DocumentLineInput[] = [
  { kind: "item", label: "Site internet", qtyMilli: 1000, unitPriceHt: 50000, vatRateBps: 810 },
  { kind: "detail", label: "Développement", qtyMilli: 0, unitPriceHt: 0, vatRateBps: 0 },
  { kind: "section", label: "Abonnement mensuel", qtyMilli: 0, unitPriceHt: 0, vatRateBps: 0 },
  { kind: "item", label: "Gestion du site", qtyMilli: 1000, unitPriceHt: 4500, vatRateBps: 810 },
];

describe("devis — cycle de vie", () => {
  it("numérote automatiquement en DC<date><NN> et calcule les totaux", () => {
    const { quotes, company, client } = setup();
    const q = quotes.create(company.id, {
      issueDate: "2026-07-22",
      thirdPartyId: client.id,
      title: "Site internet et maintenance serveur",
      lines: LINES,
    });

    expect(q.number).toBe("DC2026072201");
    expect(q.amountHt).toBe(54500);
    expect(q.vatAmount).toBe(4415);
    expect(q.amountTtc).toBe(58915);
    expect(q.lines).toHaveLength(4);
    expect(q.status).toBe("draft");
  });

  it("conserve l'ordre des lignes, sections comprises", () => {
    const { quotes, company } = setup();
    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    expect(q.lines.map((l) => l.kind)).toEqual(["item", "detail", "section", "item"]);
  });

  it("incrémente le compteur au sein d'une journée", () => {
    const { quotes, company } = setup();
    quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    const second = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    expect(second.number).toBe("DC2026072202");
  });

  it("duplique un devis en brouillon avec un nouveau numéro", () => {
    const { quotes, company } = setup();
    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    const copy = quotes.duplicate(company.id, q.id);
    expect(copy.id).not.toBe(q.id);
    expect(copy.number).not.toBe(q.number);
    expect(copy.status).toBe("draft");
    expect(copy.lines).toHaveLength(LINES.length);
  });

  it("adapte un devis refusé et relie l'original à sa version révisée", () => {
    const { quotes, company } = setup();
    const original = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    quotes.setStatus(company.id, original.id, "refused");

    const revision = quotes.revise(company.id, original.id);

    expect(revision.id).not.toBe(original.id);
    expect(revision.status).toBe("draft");
    expect(quotes.get(company.id, original.id)!.supersededByQuoteId).toBe(revision.id);
    // The original keeps its status: it is the link that takes it out of lost deals.
    expect(quotes.get(company.id, original.id)!.status).toBe("refused");
  });

  it("refuse d'adapter deux fois le même devis", () => {
    const { quotes, company } = setup();
    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    quotes.setStatus(company.id, q.id, "refused");
    quotes.revise(company.id, q.id);
    expect(() => quotes.revise(company.id, q.id)).toThrow(/déjà été adapté/);
  });

  it("passe à « expiré » les devis dont la validité est dépassée", () => {
    const { quotes, company } = setup();
    quotes.create(company.id, {
      issueDate: "2026-07-22",
      validUntil: "2026-08-21",
      status: "sent",
      lines: LINES,
    });
    expect(quotes.refreshExpired(company.id, "2026-09-01")).toBe(1);
    expect(quotes.list(company.id)[0].status).toBe("expired");
  });
});

describe("devis — conversion en facture et décompte TVA", () => {
  /** VAT return of Q3 2026, computed on the fly the way the VAT screen does. */
  function vatBase(companyId: string) {
    return createVatReturnsRepo(db).computeLive(companyId, "quarterly", 2026, 3);
  }

  it("n'entre PAS dans le décompte TVA tant qu'il est à l'état de devis", () => {
    const { quotes, company, client } = setup();
    quotes.create(company.id, {
      issueDate: "2026-07-22",
      thirdPartyId: client.id,
      lines: LINES,
    });

    // No turnover: a quote is not an accounting operation.
    expect(vatBase(company.id).result.b200).toBe(0);
  });

  it("crée une facture de vente en brouillon reprenant le devis", () => {
    const { quotes, company, client } = setup();
    const q = quotes.create(company.id, {
      issueDate: "2026-07-22",
      thirdPartyId: client.id,
      title: "Site internet",
      lines: LINES,
    });

    const created = quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-22" });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      type: "sale",
      status: "draft",
      amountHt: 54500,
      vatAmount: 4415,
      amountTtc: 58915,
      thirdPartyId: client.id,
      quoteId: q.id,
    });
    // The lines are copied over so that the invoice PDF is identical.
    expect(quotes.linesOf(company.id, "invoice", created[0].id)).toHaveLength(LINES.length);
  });

  it("alimente le décompte TVA une fois la facture émise", () => {
    const { quotes, invoices, company, client } = setup();
    const q = quotes.create(company.id, {
      issueDate: "2026-07-22",
      thirdPartyId: client.id,
      lines: LINES,
    });
    const [invoice] = quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-22" });

    // The draft does not count yet.
    expect(vatBase(company.id).result.b200).toBe(0);

    invoices.update(company.id, invoice.id, {
      type: "sale",
      issueDate: "2026-07-22",
      treatment: "standard",
      rate: "normal",
      enteredAs: "ht",
      enteredAmount: 54500,
      status: "issued",
    });

    // Once issued, it enters worldwide turnover and the 8.1 % taxable base.
    const res = vatBase(company.id).result;
    expect(res.b200).toBe(54500);
    expect(res.b303).toBe(54500);
  });

  it("marque le devis comme facturé et empêche double conversion et modification", () => {
    const { quotes, company } = setup();
    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-22" });

    const after = quotes.get(company.id, q.id)!;
    expect(after.status).toBe("invoiced");
    expect(after.invoiceId).toBeTruthy();

    expect(() => quotes.convertToInvoice(company.id, q.id)).toThrow(/déjà été converti/);
    expect(() =>
      quotes.update(company.id, q.id, { issueDate: "2026-07-22", lines: LINES }),
    ).toThrow(/supprimez d'abord la facture/);
    expect(() => quotes.delete(company.id, q.id)).toThrow(/supprimez d'abord la facture/);
  });

  it("redevient supprimable une fois sa facture supprimée", () => {
    const { quotes, invoices, company } = setup();
    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    const [invoice] = quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-22" });

    // As long as the invoice exists, the quote stays protected.
    expect(() => quotes.delete(company.id, q.id)).toThrow(/supprimez d'abord la facture/);

    invoices.delete(company.id, invoice.id);
    expect(quotes.delete(company.id, q.id)).toEqual({ ok: true });
    expect(quotes.get(company.id, q.id)).toBeNull();
    // The lines of the quote go away with it.
    expect(quotes.linesOf(company.id, "quote", q.id)).toHaveLength(0);
  });

  it("repasse « accepté » — modifiable et reconvertible — quand la facture est supprimée", () => {
    const { quotes, invoices, company } = setup();
    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    const [invoice] = quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-22" });
    expect(() =>
      quotes.update(company.id, q.id, { issueDate: "2026-07-22", lines: LINES }),
    ).toThrow(/supprimez d'abord la facture/);

    invoices.delete(company.id, invoice.id);
    quotes.releaseInvoice(company.id, q.id);

    const released = quotes.get(company.id, q.id)!;
    expect(released.status).toBe("accepted");
    expect(released.invoiceId).toBeNull();
    expect(released.acceptedAt).toBeTruthy();

    // Editable again…
    const updated = quotes.update(company.id, q.id, {
      issueDate: "2026-07-23",
      lines: LINES,
    });
    expect(updated.issueDate).toBe("2026-07-23");
    // …and convertible into an invoice again.
    expect(quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-23" })).toHaveLength(1);
    expect(quotes.get(company.id, q.id)!.status).toBe("invoiced");
  });

  it("répare les devis restés « facturés » alors que leur facture a disparu", () => {
    const { quotes, invoices, company } = setup();
    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    const [invoice] = quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-22" });

    // Off-path deletion (old version, import…): the quote stays locked.
    invoices.delete(company.id, invoice.id);
    expect(quotes.get(company.id, q.id)!.status).toBe("invoiced");

    // The sweep on opening catches it.
    expect(quotes.releaseOrphaned(company.id)).toBe(1);
    expect(quotes.get(company.id, q.id)!.status).toBe("accepted");
    // Idempotent: nothing left to release on the next pass.
    expect(quotes.releaseOrphaned(company.id)).toBe(0);
  });

  it("ne libère pas le devis tant qu'une facture issue de lui subsiste", () => {
    const { quotes, invoices, company } = setup();
    const q = quotes.create(company.id, {
      issueDate: "2026-07-22",
      lines: [
        { kind: "item", label: "Conseil", qtyMilli: 1000, unitPriceHt: 10000, vatRateBps: 810 },
        { kind: "item", label: "Repas", qtyMilli: 1000, unitPriceHt: 5000, vatRateBps: 260 },
      ],
    });
    // Multi-rate quote: one invoice per rate.
    const created = quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-22" });
    expect(created).toHaveLength(2);

    invoices.delete(company.id, created[0].id);
    quotes.releaseInvoice(company.id, q.id);
    expect(quotes.get(company.id, q.id)!.status).toBe("invoiced");

    invoices.delete(company.id, created[1].id);
    quotes.releaseInvoice(company.id, q.id);
    expect(quotes.get(company.id, q.id)!.status).toBe("accepted");
  });

  it("émet une facture par taux pour préserver la ventilation TVA", () => {
    const { quotes, company } = setup();
    const q = quotes.create(company.id, {
      issueDate: "2026-07-22",
      lines: [
        { kind: "item", label: "Conseil", qtyMilli: 1000, unitPriceHt: 10000, vatRateBps: 810 },
        { kind: "item", label: "Repas", qtyMilli: 1000, unitPriceHt: 5000, vatRateBps: 260 },
      ],
    });

    const created = quotes.convertToInvoice(company.id, q.id, { issueDate: "2026-07-22" });
    expect(created).toHaveLength(2);
    expect(created.map((i) => i.vatRateBps).sort()).toEqual([260, 810]);
  });
});

describe("devis — isolation par société", () => {
  it("ne laisse jamais voir les devis d'une autre société", () => {
    const { quotes, companies, company } = setup();
    const other = companies.create({ name: "Autre", legalForm: "sarl" });

    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    expect(quotes.list(other.id)).toHaveLength(0);
    expect(quotes.get(other.id, q.id)).toBeNull();
  });

  it("numérote indépendamment chaque société", () => {
    const { quotes, companies, company } = setup();
    const other = companies.create({ name: "Autre", legalForm: "sarl" });
    quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    const q = quotes.create(other.id, { issueDate: "2026-07-22", lines: LINES });
    expect(q.number).toBe("DC2026072201");
  });
});

describe("comptes bancaires", () => {
  it("désigne le premier compte comme compte par défaut", () => {
    const { banks, company } = setup();
    const a = banks.create(company.id, { label: "UBS", iban: "CH390022622616737740Q" });
    expect(a.isDefault).toBe(true);
    expect(banks.getDefault(company.id)?.id).toBe(a.id);
  });

  it("ne conserve qu'un seul compte par défaut", () => {
    const { banks, company } = setup();
    banks.create(company.id, { label: "UBS", iban: "CH390022622616737740Q" });
    const b = banks.create(company.id, {
      label: "PostFinance",
      iban: "CH4431999123000889012",
      isDefault: true,
    });

    const all = banks.list(company.id);
    expect(all.filter((x) => x.isDefault).map((x) => x.id)).toEqual([b.id]);
  });
});

/** Clause of a contract by its title. */
function article(blocks: ContractBlock[], title: string): ArticleBlock {
  return blocks.find((b): b is ArticleBlock => b.type === "article" && b.title === title)!;
}

describe("contrats", () => {
  it("crée le modèle Qwasar par défaut au premier accès", () => {
    const { contracts, company } = setup();
    const template = contracts.defaultTemplate(company.id);
    expect(template.isDefault).toBe(true);
    const articles = template.blocks.filter((b) => b.type === "article");
    expect(articles).toHaveLength(15);
    expect(article(template.blocks, "Objet")).toBeTruthy();
    // Summary at the top, signatures of both parties at the end.
    expect(template.blocks[0].type).toBe("commitments");
    expect(template.blocks.at(-1)!.type).toBe("signatures");
  });

  it("résout les variables du modèle avec les valeurs du contrat", () => {
    const { contracts, company } = setup();
    const blocks = contracts.blocksFor(company.id, {
      oneOffAmountHt: 50000,
      monthlyAmountHt: 4500,
      minDurationMonths: 18,
      noticeDays: 30,
    });

    // The contract secures the fixed price as much as the subscription.
    const prix = article(blocks, "Prix");
    expect(prix.body).toContain("500.00 CHF");
    expect(prix.body).toContain("45.00 CHF");
    expect(prix.body).not.toContain("{{");

    const duree = article(blocks, "Durée");
    expect(duree.body).toContain("18 mois");
  });

  it("couvre les prestations ponctuelles dans l'objet et le paiement", () => {
    const { contracts, company } = setup();
    const blocks = contracts.blocksFor(company.id, { oneOffAmountHt: 50000 });

    expect(article(blocks, "Objet").body).toMatch(/ponctuelles/i);
    expect(article(blocks, "Paiement").body).toMatch(/reste dû/i);
    expect(article(blocks, "Résiliation anticipée").body).toMatch(
      /prestations ponctuelles/i,
    );
  });

  it("enregistre le montant ponctuel du contrat", () => {
    const { contracts, company } = setup();
    const c = contracts.create(company.id, {
      issueDate: "2026-07-22",
      oneOffAmountHt: 50000,
      monthlyAmountHt: 4500,
      blocks: [],
    });
    expect(contracts.get(company.id, c.id)!.oneOffAmountHt).toBe(50000);
  });

  it("numérote en CC<date><NN> et fige les articles", () => {
    const { contracts, company, client } = setup();
    const c = contracts.create(company.id, {
      issueDate: "2026-07-22",
      thirdPartyId: client.id,
      title: "Prestation web",
      blocks: contracts.blocksFor(company.id, { monthlyAmountHt: 4500 }),
    });

    expect(c.number).toBe("CC2026072201");
    expect(c.blocks.filter((b) => b.type === "article")).toHaveLength(15);
    expect(JSON.stringify(c.blocks)).not.toContain("{{");
  });

  it("protège un contrat signé contre la modification de son contenu", () => {
    const { contracts, company } = setup();
    const c = contracts.create(company.id, {
      issueDate: "2026-07-22",
      blocks: contracts.blocksFor(company.id, {}),
    });
    contracts.setStatus(company.id, c.id, "signed", "2026-07-22");

    // The notes stay editable: same content, regenerated local ids included.
    const signed = contracts.get(company.id, c.id)!;
    expect(() =>
      contracts.update(company.id, c.id, {
        issueDate: "2026-07-22",
        status: "signed",
        signedDate: "2026-07-22",
        notes: "Relancé",
        blocks: signed.blocks.map((b) => ({ ...b, id: `autre-${b.id}` })),
      }),
    ).not.toThrow();

    expect(() =>
      contracts.update(company.id, c.id, {
        issueDate: "2026-07-22",
        blocks: [{ id: "x", type: "article", title: "Modifié", body: "Texte réécrit" }],
      }),
    ).toThrow(/ne peut plus être modifié/);
    expect(() => contracts.delete(company.id, c.id)).toThrow(/ne peut pas être supprimé/);
  });

  it("relie le contrat au devis dans les deux sens", () => {
    const { contracts, quotes, company } = setup();
    const q = quotes.create(company.id, { issueDate: "2026-07-22", lines: LINES });
    const c = contracts.create(company.id, {
      issueDate: "2026-07-22",
      quoteId: q.id,
      blocks: [],
    });

    expect(c.quoteId).toBe(q.id);
    expect(quotes.get(company.id, q.id)!.contractId).toBe(c.id);
  });
});
