/**
 * Typed contract sections: reading the legacy format, numbering,
 * variables, model catalog and PDF rendering.
 */

import { describe, expect, it } from "vitest";
import {
  articleNumbers,
  emptyBlock,
  isLegacyShape,
  legacyFrame,
  normalizeBlocks,
  withIds,
  type ContractBlock,
} from "../src/shared/documents/contract-blocks.js";
import { CONTRACT_MODELS, DEFAULT_MODEL_KEY, findModel } from "../src/shared/documents/contract-models.js";
import { DEFAULT_CONTRACT_VARIABLES, resolveBlocks } from "../src/shared/documents/contract-template.js";
import { buildContractHtml } from "../src/main/export/pdf/contractHtml.js";
import type { Signature } from "../src/shared/signatures.js";

import { resolve } from "node:path";

const FONTS = resolve(process.cwd(), "resources/fonts");
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("sections — lecture", () => {
  it("lit l'ancien format { title, body } comme des articles", () => {
    const blocks = normalizeBlocks([{ title: "Objet", body: "Texte" }, { title: "Prix", body: "" }]);
    expect(blocks.map((b) => b.type)).toEqual(["article", "article"]);
    expect(blocks.every((b) => typeof b.id === "string" && b.id.length > 0)).toBe(true);
    expect(isLegacyShape(blocks)).toBe(true);
  });

  it("ignore l'illisible sans rendre le contrat inutilisable", () => {
    const blocks = normalizeBlocks([null, 42, { type: "inconnu" }, { type: "article" }, { type: "text", body: "ok" }]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    expect(normalizeBlocks("pas un tableau")).toEqual([]);
  });

  it("borne les champs (signataires client entre 1 et 3)", () => {
    const [sig] = normalizeBlocks([{ type: "signatures", clientSignatories: 12, signatureIds: ["a", 3] }]);
    expect(sig.type === "signatures" && sig.clientSignatories).toBe(3);
    expect(sig.type === "signatures" && sig.signatureIds).toEqual(["a"]);
  });
});

describe("sections — numérotation", () => {
  it("numérote articles, listes et tableaux titrés, en continu", () => {
    const blocks: ContractBlock[] = [
      emptyBlock("parties"),
      { ...emptyBlock("article"), title: "Objet" } as ContractBlock,
      { ...emptyBlock("heading"), title: "Partie II" } as ContractBlock,
      { ...emptyBlock("list"), title: "Prestations" } as ContractBlock,
      { ...emptyBlock("list"), title: "" } as ContractBlock, // no title: no number
      { ...emptyBlock("table"), title: "Tarifs", numbered: false } as ContractBlock,
      { ...emptyBlock("table"), title: "Échéancier" } as ContractBlock,
      emptyBlock("signatures"),
    ];
    expect(articleNumbers(blocks)).toEqual([null, 1, null, 2, null, null, 3, null]);
  });
});

describe("sections — ancien format à l'impression", () => {
  it("ajoute récapitulatif et signatures aux seuls contrats d'avant la v1.20", () => {
    const legacy = normalizeBlocks([{ title: "Objet", body: "Texte" }]);
    expect(legacyFrame(legacy).map((b) => b.type)).toEqual(["commitments", "article", "signatures"]);
    const modern = withIds(findModel("nda").blocks);
    expect(legacyFrame(modern)).toBe(modern);
  });
});

describe("sections — variables", () => {
  it("résout les variables dans tous les types de sections", () => {
    const blocks = withIds([
      { type: "list", title: "Pour {{client}}", intro: "{{prestataire}} fournit :", items: ["{{montantMensuel}} par mois"], style: "bullet", numbered: true },
      { type: "table", title: "Durée", headers: ["", ""], rows: [{ label: "Engagement", value: "{{dureeMinimale}}" }], numbered: true },
      { type: "signatures", signatureIds: [], placeDate: true, providerTitle: "Pour {{prestataire}}", clientTitle: "Pour {{client}}", clientMention: "", clientSignatories: 1 },
    ]);
    const out = resolveBlocks(blocks, {
      ...DEFAULT_CONTRACT_VARIABLES,
      client: "Client SA",
      provider: "Qwasar Sàrl",
      monthlyAmountHt: 4500,
      minDurationMonths: 18,
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain("{{");
    expect(text).toContain("Pour Client SA");
    expect(text).toContain("Qwasar Sàrl fournit");
    expect(text).toContain("45.00 CHF par mois");
    expect(text).toContain("18 mois");
  });
});

describe("catalogue de modèles", () => {
  it("chaque modèle est valide, relu à l'identique et se termine par les signatures des deux parties", () => {
    for (const m of CONTRACT_MODELS) {
      const blocks = withIds(m.blocks);
      expect(normalizeBlocks(JSON.parse(JSON.stringify(blocks))), m.key).toEqual(blocks);
      expect(blocks.at(-1)!.type, m.key).toBe("signatures");
      expect(blocks.filter((b) => b.type === "article").every((b) => b.type === "article" && b.title.trim()), m.key).toBe(true);
    }
  });

  it("le modèle par défaut reprend les 15 articles Qwasar", () => {
    const m = findModel(DEFAULT_MODEL_KEY);
    expect(m.blocks.filter((b) => b.type === "article")).toHaveLength(15);
    expect(findModel("inexistant").key).toBe(DEFAULT_MODEL_KEY);
  });

  it("n'utilise que des variables connues", () => {
    const known = new Set(["client", "prestataire", "objet", "montantPonctuel", "montantMensuel", "dureeMinimale", "preavis", "dateDebut", "jourEcheance", "interetMoratoire", "canton"]);
    for (const m of CONTRACT_MODELS) {
      for (const [, key] of JSON.stringify(m.blocks).matchAll(/\{\{(\w+)\}\}/g)) {
        expect(known.has(key), `${m.key} : {{${key}}}`).toBe(true);
      }
    }
  });
});

describe("contrat — rendu PDF des sections", () => {
  const signature: Signature = {
    id: "sig-1", companyId: "c", associateId: null, name: "Thomas Exemple", role: "Associé gérant",
    image: PNG, isDefault: true, createdAt: "", updatedAt: "",
  };
  const view = {
    number: "CC1",
    title: "Contrat",
    issueDate: "2026-09-21",
    sender: { name: "Qwasar Sàrl", details: ["Rue 1", "3000 Berne"] },
    client: { name: "Client SA", details: [] },
    logoText: "QWASAR",
    contact: "",
    signedPlace: "Berne",
    signedDate: null,
    signatures: [signature],
  };

  it("imprime chaque type de section, numéros compris", () => {
    const blocks = withIds([
      { type: "parties", intro: "Entre les soussignés :", providerLabel: "le Prestataire", clientLabel: "le Client" },
      { type: "article", title: "Objet", body: "Texte" },
      { type: "list", title: "Prestations", intro: "", items: ["Un", "Deux"], style: "letter", numbered: true },
      { type: "table", title: "Tarifs", headers: ["Prestation", "Prix"], rows: [{ label: "Heure", value: "CHF 120" }], numbered: true },
      { type: "callout", title: "Important", body: "Clause" },
      { type: "pageBreak" },
      { type: "signatures", signatureIds: ["sig-1"], placeDate: true, providerTitle: "Le Prestataire", clientTitle: "Le Client", clientMention: "Bon pour accord", clientSignatories: 2 },
    ]);
    const html = buildContractHtml({ ...view, blocks }, FONTS);
    expect(html).toContain("<h2>1. Objet</h2>");
    expect(html).toContain("<h2>2. Prestations</h2>");
    expect(html).toContain('<ol type="a">');
    expect(html).toContain("<h2>3. Tarifs</h2>");
    expect(html).toContain("ci-après « le Prestataire »");
    expect(html).toContain('class="callout"');
    expect(html).toContain('class="page-break"');
    // Both parties sign: our signature (image + name), two lines on the customer side.
    expect(html).toContain(`src="${PNG}"`);
    expect(html).toContain("Thomas Exemple");
    expect(html.match(/Nom, prénom et fonction/g)).toHaveLength(2);
    expect(html).toContain("Fait à Berne");
  });

  it("n'imprime jamais une image de signature qui ne serait pas une image", () => {
    const blocks = withIds([
      { type: "signatures", signatureIds: ["sig-1"], placeDate: false, providerTitle: "P", clientTitle: "C", clientMention: "", clientSignatories: 1 },
    ]);
    const html = buildContractHtml(
      { ...view, blocks, signatures: [{ ...signature, image: "javascript:alert(1)" }] },
      FONTS,
    );
    expect(html).not.toContain("javascript:");
  });
});
