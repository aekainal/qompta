/**
 * Contract preview while it is being built: variables resolved with the entered
 * values, article numbering, parties and signatures. Faithful to the PDF in
 * order and content; the exact layout remains that of the PDF preview.
 */

import {
  articleNumbers,
  legacyFrame,
  type ContractBlock,
} from "@shared/documents/contract-blocks.js";
import { resolveBlocks, type ContractVariables } from "@shared/documents/contract-template.js";
import type { Signature } from "@shared/signatures.js";
import { formatChf } from "../../../lib/format.js";

export interface PreviewContext {
  variables: ContractVariables;
  providerName: string;
  clientName: string;
  oneOffAmountHt: number | null;
  monthlyAmountHt: number | null;
  minDurationMonths: number | null;
  signatures: Signature[];
}

export function ContractPreview({ blocks, ctx }: { blocks: ContractBlock[]; ctx: PreviewContext }) {
  const resolved = resolveBlocks(legacyFrame(blocks), ctx.variables);
  const numbers = articleNumbers(resolved);

  return (
    <div className="rounded-lg border bg-white p-8 text-[13px] leading-relaxed text-neutral-900 shadow-inner">
      {resolved.map((b, i) => (
        <PreviewBlock key={b.id} block={b} n={numbers[i]} ctx={ctx} />
      ))}
      {resolved.length === 0 && <p className="text-neutral-400">Aucune section.</p>}
    </div>
  );
}

function PreviewBlock({ block: b, n, ctx }: { block: ContractBlock; n: number | null; ctx: PreviewContext }) {
  const heading = (title: string) =>
    title.trim() ? (
      <h3 className="mb-1 font-bold">
        {n != null ? `${n}. ` : ""}
        {title}
      </h3>
    ) : null;

  switch (b.type) {
    case "article":
      return (
        <div className="mt-4">
          {heading(b.title)}
          <p className="whitespace-pre-line">{b.body}</p>
        </div>
      );
    case "heading":
      return (
        <div className="mt-6">
          <div className="font-bold uppercase tracking-wide text-primary">{b.title}</div>
          {b.subtitle && <div className="italic">{b.subtitle}</div>}
        </div>
      );
    case "text":
      return <p className="mt-4 whitespace-pre-line">{b.body}</p>;
    case "list": {
      const items = b.items.filter((i) => i.trim());
      const cls = b.style === "bullet" ? "list-disc" : b.style === "number" ? "list-decimal" : "list-[lower-alpha]";
      return (
        <div className="mt-4">
          {heading(b.title)}
          {b.intro && <p>{b.intro}</p>}
          <ul className={`${cls} mt-1 pl-6`}>
            {items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        </div>
      );
    }
    case "table":
      return (
        <div className="mt-4">
          {heading(b.title)}
          <table className="mt-1 w-full border-collapse">
            {(b.headers[0] || b.headers[1]) && (
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs">
                  <th className="py-1 pr-3">{b.headers[0]}</th>
                  <th className="py-1">{b.headers[1]}</th>
                </tr>
              </thead>
            )}
            <tbody>
              {b.rows.filter((r) => r.label || r.value).map((r, i) => (
                <tr key={i} className="border-b border-neutral-200 align-top">
                  <td className="w-[45%] py-1 pr-3 font-semibold">{r.label}</td>
                  <td className="py-1">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout":
      return (
        <div className="mt-4 border-l-4 border-primary bg-slate-100 px-4 py-2">
          {b.title && <div className="font-bold">{b.title}</div>}
          <p className="whitespace-pre-line">{b.body}</p>
        </div>
      );
    case "parties":
      return (
        <div className="mt-4 space-y-1">
          {b.intro && <p>{b.intro}</p>}
          <p><b>{ctx.providerName || "Votre société"}</b>, ci-après « {b.providerLabel} »,</p>
          <p>et</p>
          <p><b>{ctx.clientName || "Client à définir"}</b>, ci-après « {b.clientLabel} ».</p>
        </div>
      );
    case "commitments": {
      if (ctx.oneOffAmountHt == null && ctx.monthlyAmountHt == null) {
        return <p className="mt-4 text-xs italic text-neutral-400">Récapitulatif financier : aucun montant saisi.</p>;
      }
      return (
        <table className="mt-4">
          <tbody>
            {ctx.oneOffAmountHt != null && (
              <tr><td className="pr-8">Prestations ponctuelles</td><td className="font-bold">{formatChf(ctx.oneOffAmountHt)} CHF HT</td></tr>
            )}
            {ctx.monthlyAmountHt != null && (
              <tr>
                <td className="pr-8">Abonnement mensuel</td>
                <td className="font-bold">
                  {formatChf(ctx.monthlyAmountHt)} CHF HT / mois
                  {ctx.minDurationMonths ? ` · engagement ${ctx.minDurationMonths} mois` : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      );
    }
    case "signatures": {
      const chosen = b.signatureIds
        .map((id) => ctx.signatures.find((s) => s.id === id))
        .filter((s): s is Signature => !!s);
      return (
        <div className="mt-8">
          {b.placeDate && <p>Fait à …, le …</p>}
          <div className="mt-4 grid grid-cols-2 gap-10 font-bold">
            <div>
              {b.providerTitle}
              <div className="font-normal">{ctx.providerName}</div>
              {chosen.length === 0 && <div className="mt-12 border-t border-neutral-800" />}
              {chosen.map((s) => (
                <div key={s.id} className="mt-3 font-normal">
                  <img src={s.image} alt="" className="max-h-14 object-contain" />
                  <div className="border-t border-neutral-800" />
                  <div className="font-bold">{s.name}</div>
                  {s.role && <div className="text-xs">{s.role}</div>}
                </div>
              ))}
            </div>
            <div>
              {b.clientTitle}
              {b.clientMention && <div className="font-normal italic">{b.clientMention}</div>}
              <div className="font-normal">{ctx.clientName}</div>
              {Array.from({ length: b.clientSignatories }, (_, i) => (
                <div key={i} className="mt-12 border-t border-neutral-800 pt-0.5 text-xs font-normal">
                  Nom, prénom et fonction
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    case "pageBreak":
      return <div className="my-6 border-t-2 border-dashed border-neutral-300 text-center text-[10px] uppercase text-neutral-400">saut de page</div>;
  }
}
