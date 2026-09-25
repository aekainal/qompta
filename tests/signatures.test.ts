/**
 * Handwritten signatures: store per company, default signature, image check,
 * and follow-through on company export / import.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createAssociatesRepo } from "../src/db/repositories/associates.repo.js";
import { createSignaturesRepo } from "../src/db/repositories/signatures.repo.js";
import { createQuotesRepo } from "../src/db/repositories/quotes.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createContractsRepo } from "../src/db/repositories/contracts.repo.js";
import { createBackupRepo } from "../src/db/repositories/backup.repo.js";
import { pickSignature, safeSignatureImage } from "../src/shared/signatures.js";
import { signatureInputSchema } from "../src/shared/schemas/signatures.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
let db: DB;
beforeEach(() => { db = createTestDb(); });

function setup() {
  const companies = createCompaniesRepo(db);
  const associates = createAssociatesRepo(db);
  const signatures = createSignaturesRepo(db);
  const company = companies.create({ name: "Qwasar", legalForm: "snc" });
  const a = associates.create(company.id, { name: "Associé A", shareBps: 5000, role: "Gérant" });
  const b = associates.create(company.id, { name: "Associé B", shareBps: 5000 });
  return { companies, associates, signatures, company, a, b };
}

describe("signatures : dépôt", () => {
  it("la première devient celle par défaut, une seule à la fois", () => {
    const { signatures, company, a, b } = setup();
    const s1 = signatures.create(company.id, { associateId: a.id, name: "Associé A", image: PNG });
    const s2 = signatures.create(company.id, { associateId: b.id, name: "Associé B", image: PNG });
    expect(signatures.get(company.id, s1.id)!.isDefault).toBe(true);
    expect(s2.isDefault).toBe(false);

    signatures.update(company.id, s2.id, { associateId: b.id, name: "Associé B", image: PNG, isDefault: true });
    expect(signatures.list(company.id).filter((s) => s.isDefault).map((s) => s.id)).toEqual([s2.id]);
  });

  it("supprimer celle par défaut passe le relais à la suivante", () => {
    const { signatures, company, a, b } = setup();
    const s1 = signatures.create(company.id, { associateId: a.id, name: "A", image: PNG });
    const s2 = signatures.create(company.id, { associateId: b.id, name: "B", image: PNG });
    signatures.remove(company.id, s1.id);
    expect(signatures.get(company.id, s2.id)!.isDefault).toBe(true);
  });

  it("garde la signature quand l'associé est supprimé", () => {
    const { signatures, associates, company, a } = setup();
    const s = signatures.create(company.id, { associateId: a.id, name: "Associé A", image: PNG });
    associates.remove(company.id, a.id);
    const kept = signatures.get(company.id, s.id)!;
    expect(kept.associateId).toBeNull();
    expect(kept.name).toBe("Associé A");
  });

  it("isole les sociétés : ni lecture croisée, ni associé d'une autre société", () => {
    const { companies, signatures, company, a } = setup();
    const other = companies.create({ name: "Autre", legalForm: "sarl" });
    signatures.create(company.id, { associateId: a.id, name: "A", image: PNG });
    expect(signatures.list(other.id)).toHaveLength(0);
    expect(() => signatures.create(other.id, { associateId: a.id, name: "A", image: PNG })).toThrow(/introuvable/);
  });
});

describe("signatures : contrôles", () => {
  it("n'accepte qu'une image en data-URI", () => {
    expect(safeSignatureImage(PNG)).toBe(PNG);
    expect(safeSignatureImage("data:image/svg+xml;base64,PHN2Zz4=")).not.toBeNull();
    expect(safeSignatureImage("javascript:alert(1)")).toBeNull();
    expect(safeSignatureImage("https://exemple.ch/signature.png")).toBeNull();
    expect(safeSignatureImage('data:image/png;base64,AAA" onerror="x')).toBeNull();
    expect(signatureInputSchema.safeParse({ name: "A", image: "https://x" }).success).toBe(false);
    expect(signatureInputSchema.safeParse({ name: " ", image: PNG }).success).toBe(false);
  });

  it("choisit la signature demandée, sinon celle par défaut, sinon la première", () => {
    const base = { companyId: "c", associateId: null, role: null, image: PNG, createdAt: "", updatedAt: "" };
    const list = [
      { ...base, id: "1", name: "Un", isDefault: false },
      { ...base, id: "2", name: "Deux", isDefault: true },
    ];
    expect(pickSignature(list, "1")!.id).toBe("1");
    expect(pickSignature(list, "supprimée")!.id).toBe("2");
    expect(pickSignature(list, null)!.id).toBe("2");
    expect(pickSignature([], null)).toBeNull();
  });
});

describe("signatures : export / import d'une société", () => {
  it("suivent la société importée, devis et contrats pointant vers les nouvelles", () => {
    const { companies, signatures, company, a } = setup();
    const quotes = createQuotesRepo(db, createInvoicesRepo(db));
    const contracts = createContractsRepo(db);
    const backup = createBackupRepo(db);

    const s = signatures.create(company.id, { associateId: a.id, name: "Associé A", image: PNG });
    quotes.create(company.id, {
      issueDate: "2026-09-21",
      signatureId: s.id,
      lines: [{ kind: "item", label: "Site", qtyMilli: 1000, unitPriceHt: 100000, vatRateBps: 810 }],
    });
    contracts.create(company.id, {
      issueDate: "2026-09-21",
      blocks: [
        { id: "x", type: "signatures", signatureIds: [s.id], placeDate: true, providerTitle: "P", clientTitle: "C", clientMention: "", clientSignatories: 1 },
      ],
    });

    backup.importFile(backup.exportCompany(company.id, "2026-09-21T00:00:00Z"));
    const imported = companies.list().find((c) => c.name.includes("importé"))!;

    const [newSig] = signatures.list(imported.id);
    expect(newSig.id).not.toBe(s.id);
    expect(newSig.image).toBe(PNG);
    // The shareholder follows too: the signature points to the imported shareholder.
    expect(newSig.associateId).not.toBe(a.id);
    expect(newSig.associateId).not.toBeNull();

    expect(quotes.list(imported.id)[0].signatureId).toBe(newSig.id);
    const block = contracts.list(imported.id)[0].blocks[0];
    expect(block.type === "signatures" && block.signatureIds).toEqual([newSig.id]);
  });
});
