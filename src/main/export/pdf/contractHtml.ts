/**
 * Builds the HTML of a contract, using the QWASAR template.
 *
 * A contract is a sequence of typed sections (see `shared/documents/contract-blocks.ts`):
 * automatically numbered articles, lists, tables, callouts, parties, financial
 * summary, signatures of both parties. No section is split across two pages,
 * except long lists and tables (row by row).
 */

import { formatChf as chf } from "../../../shared/money.js";
import { DEFAULT_BRAND, type BrandSettings } from "../../../shared/brand.js";
import {
  articleNumbers,
  legacyFrame,
  type ContractBlock,
  type SignaturesBlock,
} from "../../../shared/documents/contract-blocks.js";
import { safeSignatureImage, type Signature } from "../../../shared/signatures.js";
import { esc, escMultiline, htmlDocument, safeColor } from "./theme.js";
import { logoBlock, frDate, type PartyView } from "./documentHtml.js";

export interface ContractView {
  number: string;
  title: string;
  issueDate: string;
  blocks: ContractBlock[];
  sender: PartyView;
  client: PartyView;
  logoText: string;
  contact: string;
  /** Place and date of signature printed above the initials. */
  signedPlace: string;
  signedDate: string | null;
  brandColor?: string | null;
  /** Branding of the issuing company. Default: QWASAR template. */
  brand?: BrandSettings;
  /** Summary of the financial commitments ("commitments" section). */
  oneOffAmountHt?: number | null;
  monthlyAmountHt?: number | null;
  minDurationMonths?: number | null;
  vatRateBps?: number;
  /** Signatures saved for the company, for the "signatures" sections. */
  signatures?: Signature[];
}

function partyBlock(p: PartyView, cls: string): string {
  const details = p.details.filter(Boolean).map((d) => `<div>${esc(d)}</div>`).join("");
  return `<div class="party ${cls}"><div class="name">${esc(p.name)}</div>${details}</div>`;
}

/**
 * Summary of the commitments: the contract secures the payment of the one-off
 * service lines as much as of the subscription, so both must be readable at a
 * glance, without having to go through the articles.
 */
function commitmentBlock(view: ContractView): string {
  const rows: string[] = [];
  if (view.oneOffAmountHt != null) {
    rows.push(
      `<tr><td>Prestations ponctuelles</td><td>${chf(view.oneOffAmountHt)} CHF HT</td></tr>`,
    );
  }
  if (view.monthlyAmountHt != null) {
    const duration = view.minDurationMonths
      ? ` · engagement ${view.minDurationMonths} mois`
      : "";
    rows.push(
      `<tr><td>Abonnement mensuel</td><td>${chf(view.monthlyAmountHt)} CHF HT / mois${duration}</td></tr>`,
    );
  }
  if (rows.length === 0) return "";

  const vat = view.vatRateBps
    ? `<div class="vat-note">Montants hors TVA ; TVA suisse de ${(view.vatRateBps / 100).toFixed(2).replace(/0$/, "")} % en sus.</div>`
    : "";

  return `<div class="commitments"><table>${rows.join("")}</table></div>${vat}`;
}

/** "Between the undersigned": both parties with their contact details. */
function partiesText(view: ContractView, b: Extract<ContractBlock, { type: "parties" }>): string {
  const line = (p: PartyView, label: string, end: string) => {
    const details = p.details.filter(Boolean).join(", ");
    return `<p><b>${esc(p.name)}</b>${details ? `, ${esc(details)}` : ""}, ci-après « ${esc(label)} »${end}</p>`;
  };
  return `<div class="parties-text">
    ${b.intro ? `<p>${escMultiline(b.intro)}</p>` : ""}
    ${line(view.sender, b.providerLabel, ",")}
    <p>et</p>
    ${line(view.client, b.clientLabel, ".")}
  </div>`;
}

/** Signatures of both parties: ours (saved images) and the customer's (blank lines). */
function signaturesSection(view: ContractView, b: SignaturesBlock): string {
  const all = view.signatures ?? [];
  const chosen = b.signatureIds
    .map((id) => all.find((s) => s.id === id))
    .filter((s): s is Signature => !!s);

  const place = view.signedPlace ? `Fait à ${esc(view.signedPlace)}` : "Fait";
  const date = view.signedDate ? `, le ${esc(view.signedDate)}` : ", le ____________________";
  const placeLine = b.placeDate ? `<div class="vat-note">${place}${date}</div>` : "";

  const provider = chosen.length
    ? chosen
        .map((s) => {
          const img = safeSignatureImage(s.image);
          return `<div class="sig-slot">
            ${img ? `<img class="sig-img" src="${esc(img)}" alt="Signature de ${esc(s.name)}">` : ""}
            <div class="rule"></div>
            <div class="sig-name">${esc(s.name)}</div>
            ${s.role ? `<div class="sig-role">${esc(s.role)}</div>` : ""}
          </div>`;
        })
        .join("")
    : `<div class="sig-slot blank"><div class="rule"></div></div>`;

  const clientSlots = Array.from(
    { length: Math.max(1, b.clientSignatories) },
    () => `<div class="sig-slot blank"><div class="rule"></div><div class="sig-caption">Nom, prénom et fonction</div></div>`,
  ).join("");

  return `<div class="sign-block">
    ${placeLine}
    <div class="signatures">
      <div class="signature provider">
        ${esc(b.providerTitle)}
        <div class="sig-party">${esc(view.sender.name)}</div>
        ${provider}
      </div>
      <div class="signature client">
        ${esc(b.clientTitle)}
        ${b.clientMention ? `<div class="sig-mention">${esc(b.clientMention)}</div>` : ""}
        <div class="sig-party">${esc(view.client.name)}</div>
        ${clientSlots}
      </div>
    </div>
  </div>`;
}

function listTag(style: "bullet" | "number" | "letter"): [string, string] {
  if (style === "number") return ["<ol>", "</ol>"];
  if (style === "letter") return [`<ol type="a">`, "</ol>"];
  return ["<ul>", "</ul>"];
}

/** Renders a section. `n`: article number, or null when it is not numbered. */
export function renderBlock(view: ContractView, b: ContractBlock, n: number | null): string {
  const heading = (title: string) =>
    title.trim() ? `<h2>${n != null ? `${n}. ` : ""}${esc(title)}</h2>` : "";
  switch (b.type) {
    case "article":
      return `<div class="article">${heading(b.title)}<p>${escMultiline(b.body)}</p></div>`;
    case "heading":
      return `<div class="part-heading"><div class="title">${esc(b.title)}</div>${
        b.subtitle ? `<div class="sub">${esc(b.subtitle)}</div>` : ""
      }</div>`;
    case "text":
      return `<p class="free-text">${escMultiline(b.body)}</p>`;
    case "list": {
      const [open, close] = listTag(b.style);
      const items = b.items.filter((i) => i.trim()).map((i) => `<li>${escMultiline(i)}</li>`).join("");
      return `<div class="article">${heading(b.title)}${
        b.intro ? `<p class="intro">${escMultiline(b.intro)}</p>` : ""
      }${items ? `${open}${items}${close}` : ""}</div>`;
    }
    case "table": {
      const rows = b.rows
        .filter((r) => r.label.trim() || r.value.trim())
        .map((r) => `<tr><td>${escMultiline(r.label)}</td><td>${escMultiline(r.value)}</td></tr>`)
        .join("");
      const head =
        b.headers[0] || b.headers[1]
          ? `<thead><tr><th>${esc(b.headers[0])}</th><th>${esc(b.headers[1])}</th></tr></thead>`
          : "";
      return `<div class="article">${heading(b.title)}<table class="kv">${head}<tbody>${rows}</tbody></table></div>`;
    }
    case "callout":
      return `<div class="callout">${b.title ? `<div class="title">${esc(b.title)}</div>` : ""}${escMultiline(b.body)}</div>`;
    case "parties":
      return partiesText(view, b);
    case "commitments":
      return commitmentBlock(view);
    case "signatures":
      return signaturesSection(view, b);
    case "pageBreak":
      return `<div class="page-break"></div>`;
  }
}

export function buildContractHtml(view: ContractView, fontsDir: string): string {
  const blocks = legacyFrame(view.blocks);
  const numbers = articleNumbers(blocks);
  const content = blocks.map((b, i) => renderBlock(view, b, numbers[i])).join("\n");

  const body = `<div class="page contract">
  ${logoBlock(view.logoText, view.contact, view.brand)}

  <div class="parties">
    ${partyBlock(view.sender, "sender")}
    ${partyBlock(view.client, "client")}
  </div>

  <div class="doc-title"><strong>Contrat N°${esc(view.number)}</strong> du ${esc(frDate(view.issueDate))}${view.title ? ` : ${esc(view.title)}` : ""}</div>

  ${content}
</div>`;

  return htmlDocument(
    `Contrat ${view.number}`,
    fontsDir,
    body,
    safeColor(view.brandColor),
    { brand: view.brand ?? DEFAULT_BRAND },
  );
}
