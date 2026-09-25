/**
 * Form to enter/edit an invoice with real-time VAT computation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, Paperclip, Plus, Trash2 } from "lucide-react";
import { computeInvoice } from "@shared/invoice.js";
import { documentTotals, type DocumentLine } from "@shared/documents/totals.js";
import type {
  AccountCategory,
  BankAccount,
  Invoice,
  InvoiceAttachment,
  InvoiceInput,
  InvoiceKind,
  RateType,
  ThirdParty,
  VatTreatment,
} from "@shared/types.js";
import {
  DocumentLinesEditor,
  toDocumentLine,
  toDraft,
  toLineInput,
  type LineDraft,
} from "../../components/DocumentLinesEditor.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { Button, Field, Input, Select, Textarea } from "../../components/ui/primitives.js";
import { centsToInput, formatChf, parseChf, todayIso } from "../../lib/format.js";
import {
  forcesZeroRate,
  PURCHASE_TREATMENTS,
  RATE_LABELS,
  SALE_TREATMENTS,
  TREATMENT_LABELS,
} from "./invoice-options.js";

interface Props {
  companyId: string;
  initial?: Invoice | null;
  /** VAT-registered company? Gates the «Réglé (pour TVA)» status. */
  vatSubject: boolean;
  thirdParties: ThirdParty[];
  accounts: AccountCategory[];
  onSaved: () => void;
  onCancel: () => void;
}

export function InvoiceForm({ companyId, initial, vatSubject, thirdParties, accounts, onSaved, onCancel }: Props) {
  const actionBar = useActionBar();
  const [type, setType] = useState<InvoiceKind>(initial?.type ?? "sale");
  const [treatment, setTreatment] = useState<VatTreatment>(initial?.treatment ?? "standard");
  const [rate, setRate] = useState<RateType>(
    initial ? bpsToRate(initial.vatRateBps, initial.treatment) : "normal",
  );
  const [enteredAs, setEnteredAs] = useState<"ht" | "ttc">(initial?.enteredAs ?? "ttc");
  const [amountStr, setAmountStr] = useState(
    initial ? centsToInput(initial.enteredAs === "ht" ? initial.amountHt : initial.amountTtc) : "",
  );
  const [number, setNumber] = useState(initial?.number ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayIso());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [thirdPartyId, setThirdPartyId] = useState(initial?.thirdPartyId ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [bankAccountId, setBankAccountId] = useState(initial?.bankAccountId ?? "");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [status, setStatus] = useState(initial?.status ?? "issued");
  const [overrideCode, setOverrideCode] = useState(
    initial?.vatCodeOverride ? (initial.vatCode ?? "") : "",
  );
  const [vatOverrideStr, setVatOverrideStr] = useState(
    initial?.vatAmountOverride != null ? centsToInput(initial.vatAmountOverride) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<InvoiceAttachment[]>([]);
  /** Detail printed on the PDF; empty = invoice at the global amount (accounting entry). */
  const [lines, setLines] = useState<LineDraft[]>([]);

  // Existing lines (invoice derived from a quote, or already detailed).
  useEffect(() => {
    if (!initial) return;
    void window.api
      .invoke("invoices:lines", { companyId, id: initial.id })
      .then((rows) => setLines(rows.map(toDraft)));
  }, [companyId, initial]);

  const loadAttachments = useCallback(async () => {
    if (!initial) return;
    setAttachments(await window.api.invoke("attachments:list", { companyId, invoiceId: initial.id }));
  }, [companyId, initial]);

  useEffect(() => { void loadAttachments(); }, [loadAttachments]);

  // Bank accounts: the selected one feeds the QR payment part of the PDF.
  useEffect(() => {
    void (async () => {
      const list = await window.api.invoke("bankAccounts:list", { companyId });
      setBankAccounts(list);
      setBankAccountId((current) => current || (list.find((a) => a.isDefault)?.id ?? ""));
    })();
  }, [companyId]);

  /**
   * Number proposed for a new customer invoice (FC series).
   * The field stays editable: a purchase invoice keeps the supplier's number.
   */
  useEffect(() => {
    if (initial || type !== "sale") return;
    void (async () => {
      const { number: next } = await window.api.invoke("invoices:nextNumber", {
        companyId,
        issueDate,
      });
      setNumber((current) => current || next);
    })();
  }, [companyId, issueDate, initial, type]);

  async function pickFiles() {
    if (!initial) return;
    const list = await window.api.invoke("attachments:pick", { companyId, invoiceId: initial.id });
    setAttachments(list);
  }
  function reveal(path: string) {
    void window.api.invoke("attachments:reveal", { path });
  }
  async function removeAttachment(id: string) {
    await actionBar.track(
      "Justificatif retiré",
      () => window.api.invoke("attachments:remove", { companyId, id }),
      loadAttachments,
    );
    await loadAttachments();
  }

  const treatments = type === "sale" ? SALE_TREATMENTS : PURCHASE_TREATMENTS;
  const zeroForced = forcesZeroRate(treatment);

  /**
   * Service line detail. As soon as a service line is entered, the lines drive
   * the amount and the rate: the invoice still carries a single rate
   * (constraint of the FTA 303/313/343 breakdown), hence the refusal of
   * several rates in one document.
   */
  const docLines = useMemo<DocumentLine[]>(() => lines.map(toDocumentLine), [lines]);
  const lineTotals = useMemo(() => documentTotals(docLines), [docLines]);
  const detailed = docLines.some((l) => l.kind === "item");
  const lineRates = useMemo(
    () => [...new Set(docLines.filter((l) => l.kind === "item").map((l) => l.vatRateBps))],
    [docLines],
  );
  const multiRate = lineRates.length > 1;

  const effectiveRate: RateType = zeroForced
    ? "zero"
    : detailed
      ? bpsToRate(lineRates[0] ?? 0, treatment)
      : rate;
  const effectiveEnteredAs = detailed ? "ht" : enteredAs;

  // Keeps the treatment consistent with the type.
  useEffect(() => {
    if (!treatments.includes(treatment)) {
      setTreatment(type === "sale" ? "standard" : "input_material");
    }
  }, [type, treatment, treatments]);

  const enteredAmount = detailed ? lineTotals.ht : parseChf(amountStr);
  const vatOverride = vatOverrideStr.trim() ? parseChf(vatOverrideStr) : null;

  const preview = useMemo(() => {
    try {
      return computeInvoice({
        type,
        treatment,
        rate: effectiveRate,
        enteredAmount,
        enteredAs: effectiveEnteredAs,
        issueDate,
        vatAmountOverride: vatOverride,
      });
    } catch {
      return null;
    }
  }, [type, treatment, effectiveRate, enteredAmount, effectiveEnteredAs, issueDate, vatOverride]);

  // VAT computed automatically (no override), used as placeholder and reference.
  const autoVat = useMemo(() => {
    try {
      return computeInvoice({
        type, treatment, rate: effectiveRate, enteredAmount, enteredAs: effectiveEnteredAs, issueDate,
      }).vatAmount;
    } catch {
      return 0;
    }
  }, [type, treatment, effectiveRate, enteredAmount, effectiveEnteredAs, issueDate]);

  const filteredTp = thirdParties.filter((t) =>
    type === "sale" ? t.kind !== "supplier" : t.kind !== "client",
  );
  const relevantAccounts = accounts.filter((a) =>
    type === "sale" ? a.kind === "product" : a.kind === "expense" || a.kind === "asset",
  );

  async function save() {
    if (multiRate) {
      setError(
        "Une facture ne porte qu'un seul taux de TVA (ventilation AFC). " +
          "Séparez les prestations à 8.1 % et à 2.6 % en deux factures.",
      );
      return;
    }
    if (detailed && docLines.some((l) => !l.label.trim())) {
      setError("Chaque ligne du détail doit porter un libellé.");
      return;
    }
    setBusy(true);
    setError(null);
    const data: InvoiceInput = {
      type,
      number: number.trim() || null,
      issueDate,
      dueDate: dueDate || null,
      thirdPartyId: thirdPartyId || null,
      categoryId: categoryId || null,
      description: description.trim() || null,
      treatment,
      rate: effectiveRate,
      enteredAs: effectiveEnteredAs,
      enteredAmount,
      vatAmountOverride: vatOverride,
      status,
      vatCodeOverride: overrideCode.trim() || null,
      // Printing fields: kept as is, they play no part in the computation.
      title: title.trim() || null,
      quoteId: initial?.quoteId ?? null,
      contractId: initial?.contractId ?? null,
      bankAccountId: bankAccountId || null,
    };
    try {
      // The detail is rewritten wholesale: an empty list falls back to the invoice
      // at the global amount (the PDF then rebuilds a single line).
      const saveLines = (id: string) =>
        window.api.invoke("invoices:saveLines", { companyId, id, lines: lines.map(toLineInput) });
      if (initial) {
        // Header and lines form a single change: «Annuler» undoes both.
        await actionBar.track(
          initial.number ? `Facture ${initial.number} modifiée` : "Facture modifiée",
          async () => {
            await window.api.invoke("invoices:update", { companyId, id: initial.id, data });
            await saveLines(initial.id);
          },
          onSaved,
        );
      } else {
        const saved = await window.api.invoke("invoices:create", { companyId, data });
        await saveLines(saved.id);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as InvoiceKind)} className="w-full">
            <option value="sale">Vente</option>
            <option value="purchase">Achat</option>
          </Select>
        </Field>
        <Field label="Statut">
          <Select value={status} onChange={(e) => setStatus(e.target.value as Invoice["status"])} className="w-full">
            <option value="draft">Brouillon</option>
            <option value="issued">Émise</option>
            <option value="paid">Payée</option>
            {/* «Réglé (pour TVA)» only makes sense for a VAT-registered company (input tax recovery). */}
            {(vatSubject || initial?.status === "settled_vat") && (
              <option value="settled_vat">Réglé (pour TVA)</option>
            )}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="N° facture">
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="F-2026-001" />
        </Field>
        <Field label="Date facture">
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        <Field label="Échéance">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={type === "sale" ? "Client" : "Fournisseur"}>
          <Select value={thirdPartyId} onChange={(e) => setThirdPartyId(e.target.value)} className="w-full">
            <option value="">-</option>
            {filteredTp.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Catégorie comptable">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full">
            <option value="">-</option>
            {relevantAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} · {a.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Traitement TVA">
          <Select value={treatment} onChange={(e) => setTreatment(e.target.value as VatTreatment)} className="w-full">
            {treatments.map((t) => (
              <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Taux">
          <Select
            value={effectiveRate}
            onChange={(e) => setRate(e.target.value as RateType)}
            disabled={zeroForced || detailed}
            className="w-full"
          >
            {(["normal", "reduced", "lodging", "zero"] as RateType[]).map((r) => (
              <option key={r} value={r}>{RATE_LABELS[r]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Le montant saisi est">
          <Select
            value={effectiveEnteredAs}
            onChange={(e) => setEnteredAs(e.target.value as "ht" | "ttc")}
            disabled={detailed}
            className="w-full"
          >
            <option value="ttc">TTC</option>
            <option value="ht">HT</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label={`Montant ${effectiveEnteredAs.toUpperCase()} (CHF)`}>
          <Input
            value={detailed ? centsToInput(lineTotals.ht) : amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            disabled={detailed}
            title={detailed ? "Calculé depuis le détail des prestations." : undefined}
          />
        </Field>
        <Field label="TVA réelle (CHF), optionnel">
          <Input
            value={vatOverrideStr}
            onChange={(e) => setVatOverrideStr(e.target.value)}
            placeholder={effectiveRate === "zero" ? "0.00" : centsToInput(autoVat)}
            inputMode="decimal"
            disabled={effectiveRate === "zero"}
          />
        </Field>
        <Field label="Code décompte (forcer)">
          <Input value={overrideCode} onChange={(e) => setOverrideCode(e.target.value)} placeholder={preview?.vatCode ?? ""} />
        </Field>
      </div>
      {vatOverride != null && (
        <p className="-mt-1 text-xs text-amber-600 dark:text-amber-400">
          TVA saisie manuellement ({formatChf(vatOverride)}) : elle prime sur le calcul auto
          ({centsToInput(autoVat)} au taux {(preview ? preview.rateBps / 100 : 0).toFixed(2)} %).
        </p>
      )}

      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      {/*
        Detail printed on the PDF, in the same template as the quote. Optional:
        without a line, the invoice stays an entry at the global amount.
      */}
      <DocumentLinesEditor
        title="Détail des prestations (imprimé sur le PDF)"
        lines={lines}
        onChange={setLines}
        defaultVatRateBps={preview?.rateBps ?? 810}
        help={
          <>
            Facultatif : sans ligne, le PDF reprend la description et le montant global. ·{" "}
            <strong>Prestation</strong> : ligne facturée (quantité × prix HT) ; le montant et le
            taux de la facture en découlent. · <strong>Prestation comprise</strong> : détail sans
            montant, imprimé avec un tiret. · <strong>Nouveau tableau</strong> : son intitulé
            introduit un second tableau sur le PDF. · Une facture ne peut porter qu'un seul taux de
            TVA.
          </>
        }
      />
      {multiRate && (
        <p className="text-sm text-destructive">
          Plusieurs taux de TVA dans le détail ({lineRates.map((b) => `${(b / 100).toFixed(2)} %`).join(", ")}
          ) : une facture n'en porte qu'un seul (ventilation AFC). Séparez-les en deux factures.
        </p>
      )}

      {/* Printing fields: they play no part in the VAT computation. */}
      {type === "sale" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Objet (imprimé sur le PDF)">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Site internet et maintenance serveur"
            />
          </Field>
          <Field label="Compte bancaire (QR-facture)">
            <Select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full"
            >
              <option value="">Aucun (pas de QR-facture)</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {preview && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="grid grid-cols-4 gap-2">
            <div><span className="text-muted-foreground">HT</span><div className="font-medium">{formatChf(preview.amountHt)}</div></div>
            <div><span className="text-muted-foreground">TVA ({(preview.rateBps / 100).toFixed(2)} %)</span><div className="font-medium">{formatChf(preview.vatAmount)}</div></div>
            <div><span className="text-muted-foreground">TTC</span><div className="font-medium">{formatChf(preview.amountTtc)}</div></div>
            <div><span className="text-muted-foreground">Code</span><div className="font-medium">{overrideCode.trim() || preview.vatCode}</div></div>
          </div>
        </div>
      )}

      {/* Supporting documents: links to the files (no copy). */}
      <div className="rounded-lg border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Paperclip size={15} /> Justificatifs
          </span>
          {initial && (
            <Button variant="outline" className="h-8" onClick={() => void pickFiles()}>
              <Plus size={14} /> Lier un fichier
            </Button>
          )}
        </div>
        {!initial ? (
          <p className="text-xs text-muted-foreground">
            Enregistrez d'abord la facture, puis rouvrez-la pour y lier des fichiers.
          </p>
        ) : attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun fichier lié. « Lier un fichier » enregistre le chemin (sans copie) ; le
            bouton dossier l'ouvre dans l'explorateur.
          </p>
        ) : (
          <div className="space-y-1">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.originalName}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.filePath}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" className="h-7 px-2" onClick={() => reveal(a.filePath)} aria-label="Ouvrir dans l'explorateur">
                    <FolderOpen size={14} />
                  </Button>
                  <Button variant="ghost" className="h-7 px-2 text-destructive" onClick={() => void removeAttachment(a.id)} aria-label="Retirer">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={busy || multiRate || enteredAmount === 0}>
          {busy ? "Enregistrement…" : initial ? "Enregistrer" : "Créer la facture"}
        </Button>
      </div>
    </div>
  );
}

function bpsToRate(bps: number, treatment: VatTreatment): RateType {
  if (forcesZeroRate(treatment)) return "zero";
  if (bps === 260) return "reduced";
  if (bps === 380) return "lodging";
  if (bps === 0) return "zero";
  return "normal";
}
