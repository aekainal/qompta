/**
 * Contract creation in two steps:
 *  1. template choice (the company's default template is preselected);
 *  2. building: contract header + sections, with a preview. Changing template
 *     stays possible from the form ("Repartir d'un modèle…"), without losing
 *     the header already entered.
 *
 * From an accepted quote, step 2 arrives prefilled (customer, subject, amounts).
 */

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ContractInput, ContractTemplate, Quote, ThirdParty } from "@shared/types.js";
import type { ContractBlock } from "@shared/documents/contract-blocks.js";
import type { Signature } from "@shared/signatures.js";
import { Button } from "../../components/ui/primitives.js";
import { ContractForm, withDefaultSignature } from "./ContractForm.js";
import { ModelPicker, defaultSource, sourceBlocks, sourceName, type ContractSource } from "./ModelPicker.js";

interface Props {
  companyId: string;
  thirdParties: ThirdParty[];
  quotes: Quote[];
  /** Source quote: its values prefill the contract. */
  fromQuoteId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function ContractCreator({ companyId, thirdParties, quotes, fromQuoteId, onSaved, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [templates, setTemplates] = useState<ContractTemplate[] | null>(null);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [source, setSource] = useState<ContractSource | null>(null);
  const [blocks, setBlocks] = useState<ContractBlock[]>([]);
  const [prefill, setPrefill] = useState<Partial<ContractInput> | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      window.api.invoke("contracts:templates", { companyId }),
      window.api.invoke("signatures:list", { companyId }),
      fromQuoteId ? window.api.invoke("contracts:fromQuote", { companyId, quoteId: fromQuoteId }) : null,
    ])
      .then(([t, s, q]) => {
        setTemplates(t);
        setSignatures(s);
        setSource(defaultSource(t));
        if (q) {
          // Sections come from the chosen template; the quote only brings the values.
          const { blocks: _blocks, ...values } = q;
          setPrefill(values);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [companyId, fromQuoteId]);

  function next(src: ContractSource | null = source) {
    if (!src || !templates) return;
    setSource(src);
    setBlocks(withDefaultSignature(sourceBlocks(src, templates), signatures));
    setFormKey((k) => k + 1);
    setStep(2);
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!templates) return <p className="text-sm text-muted-foreground">Chargement des modèles…</p>;

  return (
    <div className="space-y-4">
      <Steps step={step} />
      {step === 1 ? (
        <>
          <ModelPicker templates={templates} value={source} onChange={setSource} onPickDouble={(s) => next(s)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>Annuler</Button>
            <Button onClick={() => next()} disabled={!source}>
              Continuer <ArrowRight size={16} />
            </Button>
          </div>
        </>
      ) : (
        <>
          <ContractForm
            key={formKey}
            companyId={companyId}
            thirdParties={thirdParties}
            quotes={quotes}
            initialBlocks={blocks}
            prefill={prefill}
            sourceLabel={source ? sourceName(source, templates) : undefined}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        </>
      )}
    </div>
  );
}

export function Steps({ step, labels = ["Choisir le modèle", "Construire"] }: { step: 1 | 2; labels?: [string, string] }) {
  return (
    <ol className="flex items-center gap-3 text-sm">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const current = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-8 bg-border" />}
            <span
              className={
                current
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                  : done
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary"
                    : "flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              }
            >
              {n}
            </span>
            <span className={current ? "font-medium" : "text-muted-foreground"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
