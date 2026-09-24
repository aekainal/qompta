/**
 * Contract form: header (customer, amounts, durations) + section
 * builder.
 *
 * The sections keep their `{{…}}` variables while typing: the preview resolves
 * them live with the form values, and they are **frozen on save**. A template
 * can therefore be chosen first and the amounts entered afterwards: the text
 * follows.
 */

import { useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Lock, Pencil } from "lucide-react";
import type { Contract, ContractBlock, ContractInput, ContractTemplate, Quote, ThirdParty } from "@shared/types.js";
import {
  DEFAULT_CONTRACT_VARIABLES,
  resolveBlocks,
  type ContractVariables,
} from "@shared/documents/contract-template.js";
import type { Signature } from "@shared/signatures.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { Button, Field, Input, Select, Textarea } from "../../components/ui/primitives.js";
import { centsToInput, parseChf, todayIso } from "../../lib/format.js";
import { ContractBuilder } from "./builder/ContractBuilder.js";
import { ModelPicker, defaultSource, sourceBlocks, sourceName, type ContractSource } from "./ModelPicker.js";

/** VAT rates offered for the monthly subscription (basis points). */
const VAT_RATES: { bps: number; label: string }[] = [
  { bps: 810, label: "Normal 8.10 %" },
  { bps: 260, label: "Réduit 2.60 %" },
  { bps: 380, label: "Hébergement 3.80 %" },
  { bps: 0, label: "Aucun (0 %)" },
];

/** "signatures" sections with no signatory receive the default signature. */
export function withDefaultSignature(blocks: ContractBlock[], signatures: Signature[]): ContractBlock[] {
  const def = signatures.find((s) => s.isDefault) ?? signatures[0];
  if (!def) return blocks;
  return blocks.map((b) =>
    b.type === "signatures" && b.signatureIds.length === 0 ? { ...b, signatureIds: [def.id] } : b,
  );
}

interface Props {
  companyId: string;
  initial?: Contract | null;
  thirdParties: ThirdParty[];
  quotes: Quote[];
  /** Creation: starting sections (from the template chosen at step 1). */
  initialBlocks?: ContractBlock[];
  /** Creation from a quote: values taken from the quote. */
  prefill?: Partial<ContractInput> | null;
  /** Name of the starting template, shown as a reminder. */
  sourceLabel?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function ContractForm({
  companyId,
  initial,
  thirdParties,
  quotes,
  initialBlocks,
  prefill,
  sourceLabel,
  onSaved,
  onCancel,
}: Props) {
  const { active } = useCompany();
  const base = initial ?? prefill ?? null;
  const [number, setNumber] = useState(initial?.number ?? "");
  const [numberLocked, setNumberLocked] = useState(true);
  const [issueDate, setIssueDate] = useState(base?.issueDate ?? todayIso());
  const [thirdPartyId, setThirdPartyId] = useState(base?.thirdPartyId ?? "");
  const [quoteId, setQuoteId] = useState(base?.quoteId ?? "");
  const [title, setTitle] = useState(base?.title ?? "");
  const [startDate, setStartDate] = useState(base?.startDate ?? "");
  const [endDate, setEndDate] = useState(base?.endDate ?? "");
  const [minDuration, setMinDuration] = useState(
    base?.minDurationMonths != null ? String(base.minDurationMonths) : "",
  );
  const [noticeDays, setNoticeDays] = useState(base?.noticeDays != null ? String(base.noticeDays) : "");
  const [oneOffStr, setOneOffStr] = useState(
    base?.oneOffAmountHt != null ? centsToInput(base.oneOffAmountHt) : "",
  );
  const [monthlyStr, setMonthlyStr] = useState(
    base?.monthlyAmountHt != null ? centsToInput(base.monthlyAmountHt) : "",
  );
  const [vatRateBps, setVatRateBps] = useState(base?.vatRateBps ?? 810);
  const [signedPlace, setSignedPlace] = useState(base?.signedPlace ?? "");
  const [notes, setNotes] = useState(base?.notes ?? "");
  const [blocks, setBlocks] = useState<ContractBlock[]>(initial?.blocks ?? initialBlocks ?? []);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickSource, setPickSource] = useState<ContractSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  // A signed contract keeps its content as is: the main refuses any change.
  const locked = initial?.status === "signed";
  const clientName = thirdParties.find((t) => t.id === thirdPartyId)?.name ?? "";

  useEffect(() => {
    if (!companyId) return;
    void window.api.invoke("signatures:list", { companyId }).then(setSignatures);
    void window.api.invoke("contracts:templates", { companyId }).then(setTemplates);
  }, [companyId]);

  // Number proposed automatically on creation (and on every date change).
  useEffect(() => {
    if (initial || !companyId || !numberLocked) return;
    void window.api
      .invoke("contracts:nextNumber", { companyId, issueDate })
      .then((r) => setNumber(r.number));
  }, [companyId, initial, issueDate, numberLocked]);

  const amount = (s: string) => (s.trim() ? parseChf(s) : null);
  const variables: ContractVariables = useMemo(
    () => ({
      ...DEFAULT_CONTRACT_VARIABLES,
      client: clientName,
      provider: active?.name ?? "",
      subject: title.trim(),
      startDate: startDate || null,
      oneOffAmountHt: amount(oneOffStr),
      monthlyAmountHt: amount(monthlyStr),
      minDurationMonths: minDuration.trim() ? Number(minDuration) : null,
      noticeDays: noticeDays.trim() ? Number(noticeDays) : null,
    }),
    [clientName, active?.name, title, startDate, oneOffStr, monthlyStr, minDuration, noticeDays],
  );

  function applySource(src: ContractSource) {
    const previous = blocks;
    setBlocks(withDefaultSignature(sourceBlocks(src, templates), signatures));
    setPicking(false);
    if (previous.length) {
      actionBar.undoable(`Sections remplacées par « ${sourceName(src, templates)} »`, () => setBlocks(previous));
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const data: ContractInput = {
      number: number.trim() || null,
      thirdPartyId: thirdPartyId || null,
      quoteId: quoteId || null,
      title: title.trim() || null,
      // The status is not driven here: carry it over so it is not overwritten.
      status: initial?.status,
      issueDate,
      startDate: startDate || null,
      endDate: endDate || null,
      minDurationMonths: variables.minDurationMonths,
      noticeDays: variables.noticeDays,
      oneOffAmountHt: variables.oneOffAmountHt,
      monthlyAmountHt: variables.monthlyAmountHt,
      vatRateBps,
      // Variables are frozen here: a contract no longer moves when the template evolves.
      blocks: locked ? blocks : resolveBlocks(blocks, variables),
      signedDate: initial?.signedDate ?? null,
      signedPlace: signedPlace.trim() || null,
      terminatedDate: initial?.terminatedDate ?? null,
      notes: notes.trim() || null,
    };
    try {
      if (initial) {
        await actionBar.track(
          `Contrat ${initial.number} modifié`,
          () => window.api.invoke("contracts:update", { companyId, id: initial.id, data }),
          onSaved,
        );
      } else {
        await window.api.invoke("contracts:create", { companyId, data });
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
        <Field label="N° contrat">
          <div className="flex gap-1">
            <Input
              value={number}
              readOnly={numberLocked}
              onChange={(e) => setNumber(e.target.value)}
              className={numberLocked ? "text-muted-foreground" : ""}
              placeholder="CC2026072201"
            />
            <Button
              variant="ghost"
              className="h-9 shrink-0 px-2"
              onClick={() => setNumberLocked((l) => !l)}
              title={numberLocked ? "Saisir le numéro manuellement" : "Revenir au numéro automatique"}
              aria-label="Modifier le numéro"
            >
              {numberLocked ? <Pencil size={14} /> : <Lock size={14} />}
            </Button>
          </div>
        </Field>
        <Field label="Date d'émission">
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        <Field label="Lieu de signature">
          <Input value={signedPlace} onChange={(e) => setSignedPlace(e.target.value)} placeholder="Berne" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <Select value={thirdPartyId} onChange={(e) => setThirdPartyId(e.target.value)} className="w-full">
            <option value="">—</option>
            {thirdParties
              .filter((t) => t.kind !== "supplier")
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Devis rattaché">
          <Select value={quoteId} onChange={(e) => setQuoteId(e.target.value)} className="w-full">
            <option value="">—</option>
            {quotes.map((q) => (
              <option key={q.id} value={q.id}>{q.number}{q.title ? ` — ${q.title}` : ""}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Objet du contrat">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Prestation de services mensuelle" />
      </Field>

      <div className="grid grid-cols-4 gap-3">
        <Field label="Début">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Fin">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Durée minimale (mois)">
          <Input
            value={minDuration}
            onChange={(e) => setMinDuration(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="18"
          />
        </Field>
        <Field label="Préavis (jours)">
          <Input
            value={noticeDays}
            onChange={(e) => setNoticeDays(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="30"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Prestations ponctuelles HT (CHF)">
          <Input value={oneOffStr} onChange={(e) => setOneOffStr(e.target.value)} inputMode="decimal" placeholder="0.00" />
        </Field>
        <Field label="Montant mensuel HT (CHF)">
          <Input value={monthlyStr} onChange={(e) => setMonthlyStr(e.target.value)} inputMode="decimal" placeholder="0.00" />
        </Field>
        <Field label="Taux TVA">
          <Select value={String(vatRateBps)} onChange={(e) => setVatRateBps(Number(e.target.value))} className="w-full">
            {/* The contract carries basis points, not an invoice RateType. */}
            {VAT_RATES.map((r) => (
              <option key={r.bps} value={r.bps}>{r.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="rounded-lg border p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-sm font-medium">Contenu du contrat</span>
            {sourceLabel && !initial && (
              <span className="ml-2 text-xs text-muted-foreground">à partir de « {sourceLabel} »</span>
            )}
          </div>
          {!locked && (
            <Button
              variant="outline"
              className="h-8"
              onClick={() => {
                setPickSource(defaultSource(templates));
                setPicking((p) => !p);
              }}
            >
              <LayoutTemplate size={14} /> {picking ? "Fermer les modèles" : "Repartir d'un modèle…"}
            </Button>
          )}
        </div>
        {locked && (
          <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
            Ce contrat est signé : son contenu n'est plus modifiable. Créez un avenant (structure « Avenant à un contrat »).
          </p>
        )}
        {picking ? (
          <div className="space-y-3">
            <ModelPicker templates={templates} value={pickSource} onChange={setPickSource} onPickDouble={applySource} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPicking(false)}>Garder les sections actuelles</Button>
              <Button onClick={() => pickSource && applySource(pickSource)} disabled={!pickSource}>
                Remplacer les sections
              </Button>
            </div>
          </div>
        ) : (
          <ContractBuilder
            blocks={blocks}
            onChange={setBlocks}
            readOnly={locked}
            signatures={signatures}
            preview={{
              variables,
              providerName: active?.name ?? "",
              clientName,
              oneOffAmountHt: variables.oneOffAmountHt,
              monthlyAmountHt: variables.monthlyAmountHt,
              minDurationMonths: variables.minDurationMonths,
              signatures,
            }}
          />
        )}
      </div>

      <Field label="Notes internes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? "Enregistrement…" : initial ? "Enregistrer" : "Créer le contrat"}
        </Button>
      </div>
    </div>
  );
}
