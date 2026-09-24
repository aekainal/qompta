/**
 * Configurable branding of the PDFs.
 *
 * The non-negotiable requirement comes first: **by default, nothing moves**. The
 * QWASAR template shipped so far must come out to the millimetre for any company
 * that has not opened the branding screen.
 */

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_LIMITS,
  DEFAULT_BRAND,
  normalizeBrand,
  safeFontData,
  safeFontFamily,
  safeLogoImage,
  type BrandSettings,
} from "../src/shared/brand.js";
import {
  baseCss,
  contentRightMarginMm,
  contentRightMm,
  customFontFaces,
  fontFamilyCss,
  LAYOUT,
  patternBandWidthMm,
  patternColumns,
  patternStepMm,
  qBand,
  Q_COLUMN_WIDTH,
} from "../src/main/export/pdf/theme.js";
import { documentHeader, logoBlock } from "../src/main/export/pdf/documentHtml.js";
import { buildContractHtml } from "../src/main/export/pdf/contractHtml.js";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createBrandRepo } from "../src/db/repositories/brand.repo.js";
import { createTestDb } from "./helpers/test-db.js";

const FONTS = resolve(process.cwd(), "resources/fonts");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

function brand(over: Partial<BrandSettings> = {}): BrandSettings {
  return normalizeBrand({ ...DEFAULT_BRAND, ...over });
}

describe("le gabarit QWASAR est intact par défaut", () => {
  it("reprend les corps, pas et opacité du gabarit d'origine", () => {
    const css = baseCss(FONTS, "#3b82f6", { brand: DEFAULT_BRAND });

    // Pattern: 4.2 mm font size, 5.1 mm step, 40 % opacity.
    expect(css).toContain(`font-size: ${LAYOUT.qBandFontSize.toFixed(2)}mm`);
    expect(css).toContain(`line-height: ${LAYOUT.qBandStep.toFixed(2)}mm`);
    expect(css).toContain("opacity: 0.40");
    // Logo: 10.5 mm.
    expect(css).toContain("font-size: 10.50mm");
    // Right margin of the template: 210 - 188.5.
    expect(css).toContain("padding-right: 21.50mm");
    expect(css).toContain("grid-template-columns: repeat(3, 1fr)");
  });

  it("garde le pas et le corps du gabarit d'origine", () => {
    expect(patternStepMm(DEFAULT_BRAND)).toBeCloseTo(LAYOUT.qBandStep, 6);
  });

  it("imprime le bandeau de Q sur trois colonnes", () => {
    const html = qBand();
    expect(html).toContain('class="qband"');
    expect(html).toContain("<span>Q</span>");
    // One row per step over 297 mm, across three columns.
    const expected = (Math.ceil(297 / LAYOUT.qBandStep) + 1) * LAYOUT.qBandColumns;
    expect(html.match(/<span>Q<\/span>/g)).toHaveLength(expected);
  });

  it("sans réglages du tout, le rendu est celui des réglages par défaut", () => {
    expect(qBand()).toBe(qBand(DEFAULT_BRAND));
    expect(logoBlock("QWASAR", "contact@qwasar.ch")).toContain('<div class="logo">QWASAR</div>');
  });

  it("l'en-tête d'un devis garde logo texte et ligne de contact", () => {
    const header = documentHeader({
      kind: "quote",
      number: "DC1",
      title: "",
      issueDate: "2026-07-23",
      logoText: "QWASAR",
      contact: "contact@qwasar.ch",
      sender: { name: "Qwasar", details: [] },
      client: { name: "Client", details: [] },
      lines: [],
      showSignatures: true,
    });
    expect(header).toContain('<div class="logo">QWASAR</div>');
    expect(header).toContain('<div class="logo-contact">contact@qwasar.ch</div>');
  });
});

describe("logo configurable", () => {
  it("mode image : imprime l'image, pas le texte", () => {
    const html = logoBlock("MYRRA", "hello@myrra.ch", brand({ logoMode: "image", logoImage: PNG }));
    expect(html).toContain(`<img class="logo-img" src="${PNG}"`);
    expect(html).not.toContain('class="logo"><');
  });

  it("mode image sans image : retombe sur le texte plutôt qu'un en-tête vide", () => {
    const b = brand({ logoMode: "image", logoImage: null });
    expect(b.logoMode).toBe("text");
    expect(logoBlock("MYRRA", "", b)).toContain('<div class="logo">MYRRA</div>');
  });

  it("mode aucun : ni image ni texte, mais la ligne de contact reste possible", () => {
    const html = logoBlock("MYRRA", "hello@myrra.ch", brand({ logoMode: "none" }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain('<div class="logo">');
    expect(html).toContain("hello@myrra.ch");
  });

  it("la ligne de contact peut être coupée", () => {
    const html = logoBlock("MYRRA", "hello@myrra.ch", brand({ showContact: false }));
    expect(html).not.toContain("hello@myrra.ch");
  });

  it("la hauteur du logo pilote le corps du texte et la hauteur de l'image", () => {
    const css = baseCss(FONTS, "#000000", { brand: brand({ logoHeightDmm: 160 }) });
    expect(css).toContain("font-size: 16.00mm");
    expect(css).toContain("height: 16.00mm");
  });
});

describe("nombre de colonnes du motif", () => {
  it("3 colonnes (défaut) : la géométrie du gabarit est intacte", () => {
    expect(patternColumns(DEFAULT_BRAND)).toBe(LAYOUT.qBandColumns);
    expect(patternBandWidthMm(DEFAULT_BRAND)).toBeCloseTo(LAYOUT.pageWidth - LAYOUT.qBandLeft, 6);
    // The right edge of the text lands EXACTLY on the original value.
    expect(contentRightMm(DEFAULT_BRAND)).toBeCloseTo(LAYOUT.contentRight, 6);
  });

  it("chaque colonne ajoutée rétrécit le texte d'une largeur de colonne", () => {
    for (const [columns, expected] of [
      [4, LAYOUT.contentRight - Q_COLUMN_WIDTH],
      [5, LAYOUT.contentRight - 2 * Q_COLUMN_WIDTH],
    ] as const) {
      expect(contentRightMm(brand({ patternColumns: columns }))).toBeCloseTo(expected, 6);
    }
    // ...and every column removed gives the space back to it.
    expect(contentRightMm(brand({ patternColumns: 2 }))).toBeCloseTo(
      LAYOUT.contentRight + Q_COLUMN_WIDTH,
      6,
    );
  });

  it("le texte ne dépasse jamais une marge droite égale à la marge gauche", () => {
    // At 1 column, the raw computation would give 197.2 mm: 195.2 mm is kept.
    const oneColumn = contentRightMm(brand({ patternColumns: 1 }));
    expect(oneColumn).toBeCloseTo(LAYOUT.pageWidth - LAYOUT.marginLeft, 6);
    expect(contentRightMarginMm(brand({ patternColumns: 1 }))).toBeCloseTo(LAYOUT.marginLeft, 6);
  });

  it("sans motif, le texte occupe la largeur rendue disponible", () => {
    const none = brand({ patternMode: "none" });
    expect(patternColumns(none)).toBe(0);
    expect(patternBandWidthMm(none)).toBe(0);
    expect(contentRightMm(none)).toBeCloseTo(LAYOUT.pageWidth - LAYOUT.marginLeft, 6);
  });

  it("dessine autant de cellules que de colonnes", () => {
    const rows = Math.ceil(297 / LAYOUT.qBandStep) + 1;
    for (const columns of [1, 2, 3, 4, 5]) {
      const html = qBand(brand({ patternColumns: columns }));
      expect(html.match(/<span>Q<\/span>/g)).toHaveLength(rows * columns);
    }
  });

  it("bornes : 1 à 5, tout le reste est ramené dedans", () => {
    expect(normalizeBrand({ patternColumns: 0 }).patternColumns).toBe(BRAND_LIMITS.patternColumns.min);
    expect(normalizeBrand({ patternColumns: 9 }).patternColumns).toBe(BRAND_LIMITS.patternColumns.max);
  });

  it("marges, en-tête et QR-facture bougent ensemble", () => {
    // The QR payment part must be exactly 210 mm: its negative margin cancels the
    // page padding. The three values are therefore necessarily identical.
    const b = brand({ patternColumns: 5 });
    const margin = contentRightMarginMm(b).toFixed(2);
    const css = baseCss(FONTS, "#000000", { brand: b });
    expect(css).toContain(`padding-right: ${margin}mm`);
    expect(css).toContain(`margin-right: -${margin}mm`);
    // And the band does span five columns.
    expect(css).toContain(`width: ${patternBandWidthMm(b).toFixed(2)}mm`);
    expect(css).toContain("grid-template-columns: repeat(5, 1fr)");
  });
});

describe("motif configurable", () => {
  it("peut être supprimé", () => {
    expect(qBand(brand({ patternMode: "none" }))).toBe("");
  });

  it("accepte un autre caractère", () => {
    const html = qBand(brand({ patternText: "M" }));
    expect(html).toContain("<span>M</span>");
    expect(html).not.toContain("<span>Q</span>");
  });

  it("taille et opacité suivent les réglages, le pas suit la taille", () => {
    const b = brand({ patternSizeDmm: 84, patternOpacityPct: 15 });
    const css = baseCss(FONTS, "#000000", { brand: b });
    expect(css).toContain("font-size: 8.40mm");
    expect(css).toContain("opacity: 0.15");
    // Twice as large => twice as spaced: the characters do not stick together.
    expect(patternStepMm(b)).toBeCloseTo(LAYOUT.qBandStep * 2, 6);
  });

  it("échappe le caractère saisi (le motif part dans le HTML)", () => {
    expect(qBand(brand({ patternText: "<i>" }))).toContain("&lt;i&gt;");
  });
});

describe("police des documents", () => {
  const TTF = "data:font/ttf;base64,AAEAAAALAIAAAwAw";

  it("par défaut : Inter, comme le gabarit", () => {
    expect(fontFamilyCss(DEFAULT_BRAND)).toBe("Inter, sans-serif");
    expect(customFontFaces(DEFAULT_BRAND)).toBe("");
    expect(baseCss(FONTS, "#000000", { brand: DEFAULT_BRAND })).toContain(
      "font-family: Inter, sans-serif",
    );
  });

  it("police système : nommée dans le CSS, Inter en secours", () => {
    const b = brand({ fontMode: "system", fontFamily: "Poppins" });
    expect(fontFamilyCss(b)).toBe('"Poppins", Inter, sans-serif');
    expect(baseCss(FONTS, "#000000", { brand: b })).toContain('font-family: "Poppins", Inter');
  });

  it("police fournie : embarquée en @font-face et utilisée", () => {
    const b = brand({
      fontMode: "custom",
      fontFaces: [
        { weight: 400, style: "normal", data: TTF, name: "Myrra-Regular.ttf" },
        { weight: 700, style: "normal", data: TTF, name: "Myrra-Bold.ttf" },
      ],
    });
    const css = baseCss(FONTS, "#000000", { brand: b });
    expect(css).toContain("font-family:QomptaBrand;font-weight:400");
    expect(css).toContain("font-family:QomptaBrand;font-weight:700");
    expect(css).toContain(`src:url(${TTF})`);
    expect(css).toContain("font-family: QomptaBrand, Inter, sans-serif");
    // Inter stays declared: a missing weight falls back to it, not to the
    // default font of the system.
    expect(css).toContain("font-family:Inter;font-weight:900");
  });

  it("un mode qui ne peut pas être honoré retombe sur Inter", () => {
    expect(normalizeBrand({ fontMode: "custom", fontFaces: [] }).fontMode).toBe("inter");
    expect(normalizeBrand({ fontMode: "system", fontFamily: "   " }).fontMode).toBe("inter");
  });

  it("refuse un nom de police qui tenterait d'injecter du CSS", () => {
    expect(safeFontFamily('Arial"; } body { display:none')).toBe("");
    expect(safeFontFamily("Helvetica Neue")).toBe("Helvetica Neue");
  });

  it("refuse un fichier qui n'est pas une police en data-URI", () => {
    expect(safeFontData("https://exemple.ch/police.ttf")).toBeNull();
    expect(safeFontData("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(safeFontData(TTF)).toBe(TTF);
    // An invalid weight is discarded, not half kept.
    expect(
      normalizeBrand({
        fontMode: "custom",
        fontFaces: [{ weight: 400, style: "normal", data: "javascript:alert(1)", name: "x" }],
      }).fontFaces,
    ).toEqual([]);
  });

  it("borne le nombre de graisses et le poids", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      weight: 400,
      style: "normal" as const,
      data: TTF,
      name: `f${i}.ttf`,
    }));
    expect(normalizeBrand({ fontMode: "custom", fontFaces: many }).fontFaces).toHaveLength(
      BRAND_LIMITS.maxFontFaces,
    );
    expect(
      normalizeBrand({
        fontMode: "custom",
        fontFaces: [{ weight: 5000, style: "normal", data: TTF, name: "f.ttf" }],
      }).fontFaces[0].weight,
    ).toBe(900);
  });
});

describe("normalisation des réglages", () => {
  it("borne les valeurs aberrantes au lieu de casser la mise en page", () => {
    const b = normalizeBrand({
      logoHeightDmm: 99999,
      patternSizeDmm: -5,
      patternOpacityPct: 400,
    });
    expect(b.logoHeightDmm).toBe(BRAND_LIMITS.logoHeightDmm.max);
    expect(b.patternSizeDmm).toBe(BRAND_LIMITS.patternSizeDmm.min);
    expect(b.patternOpacityPct).toBe(BRAND_LIMITS.patternOpacityPct.max);
  });

  it("refuse une image qui n'est pas une data-URI d'image", () => {
    expect(safeLogoImage("https://exemple.ch/logo.png")).toBeNull();
    expect(safeLogoImage('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(safeLogoImage(PNG)).toBe(PNG);
  });

  it("un motif vide retombe sur le caractère par défaut", () => {
    expect(normalizeBrand({ patternText: "   " }).patternText).toBe(DEFAULT_BRAND.patternText);
  });

  it("complète des réglages partiels sans rien inventer", () => {
    expect(normalizeBrand({ patternMode: "none" })).toEqual({
      ...DEFAULT_BRAND,
      patternMode: "none",
    });
    expect(normalizeBrand(null)).toEqual(DEFAULT_BRAND);
  });
});

describe("contrats", () => {
  const view = {
    number: "CC1",
    title: "Contrat",
    issueDate: "2026-07-23",
    blocks: [{ id: "a1", type: "article" as const, title: "Objet", body: "Texte" }],
    sender: { name: "Myrra", details: [] },
    client: { name: "Client", details: [] },
    logoText: "MYRRA",
    contact: "hello@myrra.ch",
    signedPlace: "Genève",
    signedDate: null,
  };

  it("suivent la même apparence que les devis et factures", () => {
    const html = buildContractHtml({ ...view, brand: brand({ logoMode: "image", logoImage: PNG }) }, FONTS);
    expect(html).toContain('<img class="logo-img"');
  });

  it("sans réglages, gardent le logo texte du gabarit d'origine", () => {
    const html = buildContractHtml(view, FONTS);
    expect(html).toContain('<div class="logo">MYRRA</div>');
    expect(html).toContain("<span>Q</span>");
  });
});

describe("persistance par société", () => {
  it("une société sans réglage renvoie le gabarit d'origine", () => {
    const db = createTestDb();
    const companies = createCompaniesRepo(db);
    const repo = createBrandRepo(db);
    const c = companies.create({ name: "Qwasar", legalForm: "sarl" });

    expect(repo.get(c.id)).toEqual(DEFAULT_BRAND);
  });

  it("les réglages d'une société n'affectent pas l'autre", () => {
    const db = createTestDb();
    const companies = createCompaniesRepo(db);
    const repo = createBrandRepo(db);
    const qwasar = companies.create({ name: "Qwasar", legalForm: "sarl" });
    const myrra = companies.create({ name: "Myrra", legalForm: "sarl" });

    repo.update(myrra.id, { ...DEFAULT_BRAND, patternText: "M", patternOpacityPct: 20 });

    expect(repo.get(myrra.id).patternText).toBe("M");
    expect(repo.get(myrra.id).patternOpacityPct).toBe(20);
    // Qwasar has not moved one iota.
    expect(repo.get(qwasar.id)).toEqual(DEFAULT_BRAND);
  });

  it("le retour au gabarit efface les réglages", () => {
    const db = createTestDb();
    const companies = createCompaniesRepo(db);
    const repo = createBrandRepo(db);
    const c = companies.create({ name: "Myrra", legalForm: "sarl" });

    repo.update(c.id, { ...DEFAULT_BRAND, logoMode: "none" });
    expect(repo.get(c.id).logoMode).toBe("none");

    expect(repo.reset(c.id)).toEqual(DEFAULT_BRAND);
    expect(repo.get(c.id)).toEqual(DEFAULT_BRAND);
  });

  it("une image invalide n'est pas persistée", () => {
    const db = createTestDb();
    const companies = createCompaniesRepo(db);
    const repo = createBrandRepo(db);
    const c = companies.create({ name: "Myrra", legalForm: "sarl" });

    const saved = repo.update(c.id, {
      ...DEFAULT_BRAND,
      logoMode: "image",
      logoImage: "javascript:alert(1)",
    });
    expect(saved.logoImage).toBeNull();
    expect(saved.logoMode).toBe("text");
  });
});
