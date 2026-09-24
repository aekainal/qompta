/**
 * Assembles database records into printable documents.
 * The PDF only knows about `DocumentView`; all the information gathering
 * (company, third party, bank account) happens here.
 */

import { SwissQRBill } from "swissqrbill/svg";
import type {
  BankAccount,
  Company,
  Contract,
  DocumentLineRecord,
  Invoice,
  Quote,
  ThirdParty,
} from "../../../shared/types.js";
import type { DocumentLine } from "../../../shared/documents/totals.js";
import { DEFAULT_BRAND, type BrandSettings } from "../../../shared/brand.js";
import { buildQrBillData, type QrAddress } from "../../../shared/documents/qrbill.js";
import { pickSignature, type Signature } from "../../../shared/signatures.js";
import { buildDocumentHtml, frDate, type DocumentView, type PartyView } from "./documentHtml.js";
import type { DocumentLayout } from "./theme.js";
import { buildContractHtml } from "./contractHtml.js";

/** Persisted lines are already in the shape expected by the totals logic. */
function toLines(lines: DocumentLineRecord[]): DocumentLine[] {
  return lines.map(({ id: _id, ...l }) => l);
}

/** Issuer block: the company, as printed at the top left. */
function senderOf(company: Company): PartyView {
  const street = [company.street, company.buildingNumber].filter(Boolean).join(" ");
  const cityLine = [company.zip, company.city].filter(Boolean).join(" ");
  return {
    name: company.name,
    details: [street, cityLine, company.vatNumber, company.rcNumber].filter(
      (v): v is string => !!v,
    ),
  };
}

/** Customer block: the third party attached to the document. */
function clientOf(tp: ThirdParty | null): PartyView {
  if (!tp) return { name: "Client à définir", details: [] };
  const street = [tp.street, tp.buildingNumber].filter(Boolean).join(" ");
  const cityLine = [tp.zip, tp.city].filter(Boolean).join(" ");
  return {
    name: tp.name,
    details: [tp.addressLine2, street, cityLine, tp.vatNumber, tp.rcNumber].filter(
      (v): v is string => !!v,
    ),
  };
}

/** Structured address required by the QR-bill. */
function qrAddressOfCompany(c: Company): QrAddress {
  return {
    name: c.name,
    street: c.street,
    buildingNumber: c.buildingNumber,
    zip: c.zip,
    city: c.city,
    country: c.country,
  };
}

function qrAddressOfThirdParty(tp: ThirdParty): QrAddress {
  return {
    name: tp.name,
    street: tp.street,
    buildingNumber: tp.buildingNumber,
    zip: tp.zip,
    city: tp.city,
    country: tp.country,
  };
}

export interface DocumentContext {
  company: Company;
  thirdParty: ThirdParty | null;
  bankAccount: BankAccount | null;
  fontsDir: string;
  /** Configured branding of the company. Absent = original QWASAR template. */
  brand?: BrandSettings;
  /** Signatures stored for the company (quotes, contracts). */
  signatures?: Signature[];
}

/** Default VAT note, consistent with the «Total TTC» column of the tables. */
function defaultVatNote(lines: DocumentLine[]): string | null {
  const rates = [...new Set(lines.filter((l) => l.kind === "item").map((l) => l.vatRateBps))];
  if (rates.length !== 1 || rates[0] === 0) return null;
  const pct = (rates[0] / 100).toFixed(2).replace(/0$/, "");
  return `Prix unitaire HT, TVA suisse de ${pct} % comprise dans le total TTC.`;
}

// ───────────────────────────── Quote ─────────────────────────────

export function buildQuoteView(
  quote: Quote,
  lines: DocumentLineRecord[],
  ctx: DocumentContext,
): DocumentView {
  const docLines = toLines(lines);
  return {
    kind: "quote",
    number: quote.number,
    title: quote.title ?? "",
    issueDate: quote.issueDate,
    untilDate: quote.validUntil,
    logoText: ctx.company.logoText || ctx.company.name,
    contact: ctx.company.email ?? "",
    sender: senderOf(ctx.company),
    client: clientOf(ctx.thirdParty),
    lines: docLines,
    vatNote: quote.vatNote ?? defaultVatNote(docLines),
    notes: quote.notes,
    showSignatures: (ctx.brand ?? DEFAULT_BRAND).showQuoteSignatures,
    // «none»: the user wants a blank line; otherwise the chosen signature or the default one.
    signature: quote.signatureId === "none" ? null : pickSignature(ctx.signatures ?? [], quote.signatureId),
    brandColor: ctx.company.color,
    brand: ctx.brand ?? DEFAULT_BRAND,
  };
}

/** HTML of a quote, parameterized by the measured pagination (repeated header). */
export function buildQuotePdfHtml(
  quote: Quote,
  lines: DocumentLineRecord[],
  ctx: DocumentContext,
): (layout: DocumentLayout) => string {
  const view = buildQuoteView(quote, lines, ctx);
  return (layout) => buildDocumentHtml(view, ctx.fontsDir, layout);
}

// ───────────────────────────── Invoice ─────────────────────────────

/**
 * QR payment part of an invoice.
 * Returns `null` — rather than failing — if the data is incomplete: an invoice
 * must stay printable even without bank details.
 */
export function buildQrSvg(
  invoice: Invoice,
  ctx: DocumentContext,
): { svg: string | null; error: string | null } {
  if (!ctx.bankAccount) {
    return { svg: null, error: "Aucun compte bancaire n'est rattaché à cette facture." };
  }
  try {
    const data = buildQrBillData({
      iban: ctx.bankAccount.iban,
      creditor: {
        ...qrAddressOfCompany(ctx.company),
        name: ctx.bankAccount.holderName || ctx.company.name,
      },
      debtor: ctx.thirdParty ? qrAddressOfThirdParty(ctx.thirdParty) : null,
      amountTtc: invoice.amountTtc,
      currency: invoice.currency,
      message: [invoice.number && `Facture ${invoice.number}`, invoice.title]
        .filter(Boolean)
        .join(" — "),
    });
    return { svg: new SwissQRBill(data, { language: "FR" }).toString(), error: null };
  } catch (err) {
    return { svg: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildInvoiceView(
  invoice: Invoice,
  lines: DocumentLineRecord[],
  ctx: DocumentContext,
  qrSvg: string | null,
): DocumentView {
  const docLines = toLines(lines);

  // An invoice without detailed lines (plain accounting entry) stays printable:
  // a single line is rebuilt from its amounts.
  const effective: DocumentLine[] =
    docLines.length > 0
      ? docLines
      : [
          {
            kind: "item",
            label: invoice.description || invoice.title || "Prestation",
            qtyMilli: 1000,
            unitPriceHt: invoice.amountHt,
            vatRateBps: invoice.vatRateBps,
          },
        ];

  return {
    kind: "invoice",
    number: invoice.number ?? "",
    title: invoice.title ?? invoice.description ?? "",
    issueDate: invoice.issueDate,
    untilDate: invoice.dueDate,
    logoText: ctx.company.logoText || ctx.company.name,
    contact: ctx.company.email ?? "",
    sender: senderOf(ctx.company),
    client: clientOf(ctx.thirdParty),
    lines: effective,
    vatNote: defaultVatNote(effective),
    notes: invoice.notes,
    showSignatures: false,
    qrSvg,
    brandColor: ctx.company.color,
    brand: ctx.brand ?? DEFAULT_BRAND,
  };
}

/**
 * HTML of an invoice. The render is parameterized by the page count: the
 * QR-bill must sit at the bottom of the last page, which requires a first
 * render to learn the pagination (see `htmlToPdfBuffer`).
 */
export function buildInvoicePdfHtml(
  invoice: Invoice,
  lines: DocumentLineRecord[],
  ctx: DocumentContext,
): { html: (layout: DocumentLayout) => string; qrError: string | null } {
  const { svg, error } = buildQrSvg(invoice, ctx);
  const view = buildInvoiceView(invoice, lines, ctx, svg);
  return { html: (layout) => buildDocumentHtml(view, ctx.fontsDir, layout), qrError: error };
}

// ──────────────────────────── Contract ─────────────────────────────

export function buildContractPdfHtml(contract: Contract, ctx: DocumentContext): string {
  return buildContractHtml(
    {
      number: contract.number,
      title: contract.title ?? "Contrat de prestation de services",
      issueDate: contract.issueDate,
      blocks: contract.blocks,
      sender: senderOf(ctx.company),
      client: clientOf(ctx.thirdParty),
      logoText: ctx.company.logoText || ctx.company.name,
      contact: ctx.company.email ?? "",
      signedPlace: contract.signedPlace ?? ctx.company.city ?? "",
      signedDate: contract.signedDate ? frDate(contract.signedDate) : null,
      brandColor: ctx.company.color,
      brand: ctx.brand ?? DEFAULT_BRAND,
      oneOffAmountHt: contract.oneOffAmountHt,
      monthlyAmountHt: contract.monthlyAmountHt,
      minDurationMonths: contract.minDurationMonths,
      vatRateBps: contract.vatRateBps,
      signatures: ctx.signatures ?? [],
    },
    ctx.fontsDir,
  );
}
