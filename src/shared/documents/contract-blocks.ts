/**
 * Contract sections: the content is no longer a plain sequence of
 * "title + text" articles, but a list of typed sections (article, list, table,
 * callout, parties, signatures…), assembled in the contract creator.
 *
 * PURE module, tested (`tests/contract-blocks.test.ts`).
 *
 * Backward compatibility: contracts and templates from before v1.20.0 store
 * `[{ title, body }]` with no `type`. `normalizeBlocks` reads them as articles, and
 * the PDF rendering adds back the financial summary and the signatures they
 * already printed (`legacyFrame`): an old contract prints exactly as before.
 */

export type ContractBlockType =
  | "article"
  | "heading"
  | "text"
  | "list"
  | "table"
  | "callout"
  | "parties"
  | "commitments"
  | "signatures"
  | "pageBreak";

interface BlockBase {
  /** Local identifier (display key, reordering). No business meaning. */
  id: string;
}

/** Numbered article: title + text. The core of a contract. */
export interface ArticleBlock extends BlockBase {
  type: "article";
  title: string;
  body: string;
}

/** Part heading ("Conditions particulières"), not numbered. */
export interface HeadingBlock extends BlockBase {
  type: "heading";
  title: string;
  subtitle: string;
}

/** Free paragraph, not numbered (preamble, remark). */
export interface TextBlock extends BlockBase {
  type: "text";
  body: string;
}

/** Bulleted, numbered or lettered list, with an optional article title. */
export interface ListBlock extends BlockBase {
  type: "list";
  title: string;
  intro: string;
  items: string[];
  style: "bullet" | "number" | "letter";
  /** Counts as a numbered article (if a title is present). */
  numbered: boolean;
}

/** Two-column table: rates, payment schedule, deliverables, service levels. */
export interface TableBlock extends BlockBase {
  type: "table";
  title: string;
  headers: [string, string];
  rows: { label: string; value: string }[];
  numbered: boolean;
}

/** Highlighted callout (important clause, warning). */
export interface CalloutBlock extends BlockBase {
  type: "callout";
  title: string;
  body: string;
}

/** "Entre les soussignés": the two parties, filled in automatically. */
export interface PartiesBlock extends BlockBase {
  type: "parties";
  intro: string;
  /** How the provider is named in the text ("le Prestataire"). */
  providerLabel: string;
  clientLabel: string;
}

/** Summary of the financial commitments, taken from the contract amounts. */
export interface CommitmentsBlock extends BlockBase {
  type: "commitments";
}

/**
 * Signature block for BOTH parties: the provider (with the stored signatures
 * of the chosen shareholders) and the customer (blank lines).
 */
export interface SignaturesBlock extends BlockBase {
  type: "signatures";
  /** Company signatures to apply (table `signatures`), in order. */
  signatureIds: string[];
  /** "Fait à …, le …" line above the signatures. */
  placeDate: boolean;
  providerTitle: string;
  clientTitle: string;
  /** Handwritten wording requested from the customer. */
  clientMention: string;
  /** Number of signatories on the customer side (1 to 3). */
  clientSignatories: number;
}

/** Forced page break when printing. */
export interface PageBreakBlock extends BlockBase {
  type: "pageBreak";
}

export type ContractBlock =
  | ArticleBlock
  | HeadingBlock
  | TextBlock
  | ListBlock
  | TableBlock
  | CalloutBlock
  | PartiesBlock
  | CommitmentsBlock
  | SignaturesBlock
  | PageBreakBlock;

/** A section without its identifier (template catalogue, data entry). */
export type ContractBlockDraft = ContractBlock extends infer B
  ? B extends ContractBlock
    ? Omit<B, "id">
    : never
  : never;

/** Description of the section types, for the "Ajouter une section" menu. */
export const BLOCK_TYPES: { type: ContractBlockType; label: string; hint: string }[] = [
  { type: "article", label: "Article", hint: "Titre et texte, numéroté automatiquement" },
  { type: "list", label: "Liste", hint: "Puces, numéros ou lettres : prestations, obligations, exclusions" },
  { type: "table", label: "Tableau", hint: "Deux colonnes : tarifs, échéancier, livrables, délais" },
  { type: "heading", label: "Titre de partie", hint: "Sépare le contrat en parties, non numéroté" },
  { type: "text", label: "Paragraphe libre", hint: "Préambule ou remarque, non numéroté" },
  { type: "callout", label: "Encadré", hint: "Clause mise en évidence" },
  { type: "parties", label: "Parties", hint: "« Entre les soussignés » rempli avec la société et le client" },
  { type: "commitments", label: "Récapitulatif financier", hint: "Montants ponctuels et mensuels du contrat" },
  { type: "signatures", label: "Signatures", hint: "Les deux parties, avec vos signatures enregistrées" },
  { type: "pageBreak", label: "Saut de page", hint: "Force la suite sur une nouvelle page" },
];

export function blockLabel(type: ContractBlockType): string {
  return BLOCK_TYPES.find((b) => b.type === type)?.label ?? type;
}

let counter = 0;
/** Unique local identifier (React key), with no dependency on `crypto`. */
export function newBlockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Empty section of a given type, ready to be filled in. */
export function emptyBlock(type: ContractBlockType): ContractBlock {
  const id = newBlockId();
  switch (type) {
    case "article":
      return { id, type, title: "", body: "" };
    case "heading":
      return { id, type, title: "", subtitle: "" };
    case "text":
      return { id, type, body: "" };
    case "list":
      return { id, type, title: "", intro: "", items: [""], style: "bullet", numbered: true };
    case "table":
      return { id, type, title: "", headers: ["", ""], rows: [{ label: "", value: "" }], numbered: true };
    case "callout":
      return { id, type, title: "", body: "" };
    case "parties":
      return {
        id,
        type,
        intro: "Entre les soussignés :",
        providerLabel: "le Prestataire",
        clientLabel: "le Client",
      };
    case "commitments":
      return { id, type };
    case "signatures":
      return {
        id,
        type,
        signatureIds: [],
        placeDate: true,
        providerTitle: "Le Prestataire",
        clientTitle: "Le Client",
        clientMention: "Bon pour accord",
        clientSignatories: 1,
      };
    case "pageBreak":
      return { id, type };
  }
}

/** Gives an identifier to sections coming from a template. */
export function withIds(drafts: ContractBlockDraft[]): ContractBlock[] {
  return drafts.map((d) => ({ ...d, id: newBlockId() }) as ContractBlock);
}

/** Deep copy of a list, with new identifiers (duplication). */
export function cloneBlocks(blocks: ContractBlock[]): ContractBlock[] {
  return blocks.map((b) => ({ ...(JSON.parse(JSON.stringify(b)) as ContractBlock), id: newBlockId() }));
}

const str = (v: unknown, max = 20000): string => (typeof v === "string" ? v.slice(0, max) : "");
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/**
 * Lenient reading of a section list stored as JSON. An entry without a
 * `type` is an article from before v1.20.0; an unreadable entry is ignored
 * rather than making the whole contract unusable.
 */
export function normalizeBlocks(raw: unknown): ContractBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ContractBlock[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" && e.id ? e.id : newBlockId();
    const type = typeof e.type === "string" ? e.type : "article";
    switch (type) {
      case "article":
        if (typeof e.title !== "string") continue;
        out.push({ id, type, title: str(e.title), body: str(e.body) });
        break;
      case "heading":
        out.push({ id, type, title: str(e.title), subtitle: str(e.subtitle) });
        break;
      case "text":
        out.push({ id, type, body: str(e.body) });
        break;
      case "list":
        out.push({
          id,
          type,
          title: str(e.title),
          intro: str(e.intro),
          items: Array.isArray(e.items) ? e.items.map((i) => str(i, 5000)) : [],
          style: e.style === "number" || e.style === "letter" ? e.style : "bullet",
          numbered: bool(e.numbered, true),
        });
        break;
      case "table": {
        const headers = Array.isArray(e.headers) ? e.headers : [];
        out.push({
          id,
          type,
          title: str(e.title),
          headers: [str(headers[0], 200), str(headers[1], 200)],
          rows: Array.isArray(e.rows)
            ? e.rows
                .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
                .map((r) => ({ label: str(r.label, 2000), value: str(r.value, 5000) }))
            : [],
          numbered: bool(e.numbered, true),
        });
        break;
      }
      case "callout":
        out.push({ id, type, title: str(e.title), body: str(e.body) });
        break;
      case "parties":
        out.push({
          id,
          type,
          intro: str(e.intro, 500),
          providerLabel: str(e.providerLabel, 100) || "le Prestataire",
          clientLabel: str(e.clientLabel, 100) || "le Client",
        });
        break;
      case "commitments":
        out.push({ id, type });
        break;
      case "signatures": {
        const n = Math.round(Number(e.clientSignatories));
        out.push({
          id,
          type,
          signatureIds: Array.isArray(e.signatureIds)
            ? e.signatureIds.filter((s): s is string => typeof s === "string")
            : [],
          placeDate: bool(e.placeDate, true),
          providerTitle: str(e.providerTitle, 200) || "Le Prestataire",
          clientTitle: str(e.clientTitle, 200) || "Le Client",
          clientMention: str(e.clientMention, 300),
          clientSignatories: Number.isFinite(n) ? Math.min(3, Math.max(1, n)) : 1,
        });
        break;
      }
      case "pageBreak":
        out.push({ id, type });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Legacy format: articles only. */
export function isLegacyShape(blocks: ContractBlock[]): boolean {
  return blocks.every((b) => b.type === "article");
}

/**
 * Sections actually printed. A contract in the legacy format receives the
 * financial summary first and the signature block last, as it did before
 * v1.20.0, without its data being rewritten.
 */
export function legacyFrame(blocks: ContractBlock[]): ContractBlock[] {
  if (!isLegacyShape(blocks)) return blocks;
  const signatures = emptyBlock("signatures") as SignaturesBlock;
  signatures.providerTitle = "Date et signature prestataire :";
  signatures.clientTitle = "Signature du client précédée de la mention";
  signatures.clientMention = "« Bon pour accord »";
  return [{ id: "legacy-commitments", type: "commitments" }, ...blocks, signatures];
}

/** Does the section carry an article number? */
export function isNumbered(b: ContractBlock): boolean {
  if (b.type === "article") return true;
  if (b.type === "list" || b.type === "table") return b.numbered && b.title.trim() !== "";
  return false;
}

/** Article number of each section (null if not numbered). Continuous across the contract. */
export function articleNumbers(blocks: ContractBlock[]): (number | null)[] {
  let n = 0;
  return blocks.map((b) => (isNumbered(b) ? ++n : null));
}

/** Applies `fn` to every entered text of a section (variable resolution). */
export function mapBlockText(b: ContractBlock, fn: (text: string) => string): ContractBlock {
  switch (b.type) {
    case "article":
    case "callout":
      return { ...b, title: fn(b.title), body: fn(b.body) };
    case "heading":
      return { ...b, title: fn(b.title), subtitle: fn(b.subtitle) };
    case "text":
      return { ...b, body: fn(b.body) };
    case "list":
      return { ...b, title: fn(b.title), intro: fn(b.intro), items: b.items.map(fn) };
    case "table":
      return {
        ...b,
        title: fn(b.title),
        headers: [fn(b.headers[0]), fn(b.headers[1])],
        rows: b.rows.map((r) => ({ label: fn(r.label), value: fn(r.value) })),
      };
    case "parties":
      return { ...b, intro: fn(b.intro) };
    case "signatures":
      return {
        ...b,
        providerTitle: fn(b.providerTitle),
        clientTitle: fn(b.clientTitle),
        clientMention: fn(b.clientMention),
      };
    default:
      return b;
  }
}

/** Number of "content" sections (excluding page breaks), for the lists. */
export function contentCount(blocks: ContractBlock[]): number {
  return blocks.filter((b) => b.type !== "pageBreak").length;
}
