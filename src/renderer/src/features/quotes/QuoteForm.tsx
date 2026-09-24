/**
 * Quote entry/edit form: header + line editor
 * (service lines, included service lines, sections) with live totals.
 */

import { useEffect, useMemo, useState } from "react";
import { documentTotals, type DocumentLine } from "@shared/documents/totals.js";
import type { BankAccount, QuoteInput, QuoteWithLines, ThirdParty } from "@shared/types.js";
import type { Signature } from "@shared/signatures.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import {
  DocumentLinesEditor,
  emptyLine,
  toDocumentLine,
  toDraft,
  toLineInput,
  type LineDraft,
} from "../../components/DocumentLinesEditor.js";
import { Button, Field, Input, Select, Textarea } from "../../components/ui/primitives.js";
import { formatChf, todayIso } from "../../lib/format.js";

interface Props {
  companyId: string;
  initial?: QuoteWithLines | null;
  thirdParties: ThirdParty[];
  bankAccounts: BankAccount[];
  onSaved: () => void;
  onCancel: () => void;
}

export function QuoteForm({
  companyId,
  initial,
  thirdParties,
  bankAccounts,
  onSaved,
  onCancel,
}: Props) {
  const [number, setNumber] = useState(initial?.number ?? "");
  const [numberTouched, setNumberTouched] = useState(false);
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayIso());
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [thirdPartyId, setThirdPartyId] = useState(initial?.thirdPartyId ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [bankAccountId, setBankAccountId] = useState(
    initial?.bankAccountId ?? bankAccounts.find((b) => b.isDefault)?.id ?? "",
  );
  const [signatureId, setSignatureId] = useState(initial?.signatureId ?? "");
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const actionBar = useActionBar();
  const [vatNote, setVatNote] = useState(initial?.vatNote ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initial ? initial.lines.map(toDraft) : [emptyLine("item")],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On creation, the DC… number follows the issue date until it has been forced.
  useEffect(() => {
    if (initial || numberTouched || !companyId) return;
    let cancelled = false;
    void window.api.invoke("quotes:nextNumber", { companyId, issueDate }).then((res) => {
      if (!cancelled) setNumber(res.number);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, initial, issueDate, numberTouched]);

  useEffect(() => {
    if (!companyId) return;
    void window.api.invoke("signatures:list", { companyId }).then(setSignatures);
  }, [companyId]);
  const defaultSignature = signatures.find((s) => s.isDefault) ?? signatures[0];

  const documentLines = useMemo<DocumentLine[]>(() => lines.map(toDocumentLine), [lines]);
  const totals = useMemo(() => documentTotals(documentLines), [documentLines]);
  const hasItem = lines.some((l) => l.kind === "item");

  async function save() {
    if (!hasItem) {
      setError("Le devis doit comporter au moins une prestation facturable.");
      return;
    }
    setBusy(true);
    setError(null);
    const data: QuoteInput = {
      number: number.trim() || null,
      issueDate,
      validUntil: validUntil || null,
      thirdPartyId: thirdPartyId || null,
      title: title.trim() || null,
      vatNote: vatNote.trim() || null,
      notes: notes.trim() || null,
      bankAccountId: bankAccountId || null,
      signatureId: signatureId || null,
      lines: lines.map(toLineInput),
    };
    try {
      if (initial) {
        await actionBar.track(
          `Devis ${initial.number} modifié`,
          () => window.api.invoke("quotes:update", { companyId, id: initial.id, data }),
          onSaved,
        );
      } else {
        await window.api.invoke("quotes:create", { companyId, data });
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
      <div className="grid grid-cols-3 gap-3">
        <Field label="N° devis">
          <Input
            value={number}
            onChange={(e) => {
              setNumberTouched(true);
              setNumber(e.target.value);
            }}
            placeholder="DC-2026-001"
          />
        </Field>
        <Field label="Date d'émission">
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        <Field label="Valable jusqu'au">
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <Select
            value={thirdPartyId}
            onChange={(e) => setThirdPartyId(e.target.value)}
            className="w-full"
          >
            <option value="">—</option>
            {thirdParties
              .filter((t) => t.kind !== "supplier")
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Objet">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Site web vitrine"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Compte bancaire">
          <Select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="w-full"
          >
            <option value="">—</option>
            {bankAccounts
              .filter((b) => !b.archived)
              .map((b) => (
                <option key={b.id} value={b.id}>{b.label} — {b.iban}</option>
              ))}
          </Select>
        </Field>
        <Field label="Signature du prestataire">
          <Select value={signatureId} onChange={(e) => setSignatureId(e.target.value)} className="w-full">
            <option value="">
              {defaultSignature ? `Par défaut — ${defaultSignature.name}` : "Aucune signature enregistrée (ligne vierge)"}
            </option>
            {signatures.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.role ? ` — ${s.role}` : ""}</option>
            ))}
            <option value="none">Aucune (ligne vierge à signer)</option>
          </Select>
        </Field>
        <Field label="Mention TVA">
          <Input
            value={vatNote}
            onChange={(e) => setVatNote(e.target.value)}
            placeholder="TVA incluse selon taux légaux"
          />
        </Field>
      </div>

      {/* Line editor: `detail` and `section` have neither quantity nor amount. */}
      <DocumentLinesEditor title="Lignes du devis" lines={lines} onChange={setLines} />

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total HT</span>
          <span className="font-medium">{formatChf(totals.ht)}</span>
        </div>
        {totals.byRate.map((g) => (
          <div key={g.vatRateBps} className="flex justify-between">
            <span className="text-muted-foreground">
              TVA {(g.vatRateBps / 100).toFixed(2)} % sur {formatChf(g.ht)}
            </span>
            <span>{formatChf(g.vat)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t pt-1 text-base font-semibold">
          <span>Total TTC</span>
          <span>{formatChf(totals.ttc)}</span>
        </div>
      </div>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={busy || !hasItem}>
          {busy ? "Enregistrement…" : initial ? "Enregistrer" : "Créer le devis"}
        </Button>
      </div>
    </div>
  );
}

