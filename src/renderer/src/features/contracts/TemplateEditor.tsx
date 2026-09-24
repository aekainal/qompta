/**
 * Creation / editing of a contract template.
 *
 * New template: 1. starting structure (one of your templates or from the catalog),
 * 2. name + building of the sections. A template keeps its `{{...}}` variables:
 * they are resolved when each contract is created.
 */

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ContractBlock, ContractTemplate } from "@shared/types.js";
import { DEFAULT_CONTRACT_VARIABLES } from "@shared/documents/contract-template.js";
import type { Signature } from "@shared/signatures.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { Button, Field, Input } from "../../components/ui/primitives.js";
import { ContractBuilder } from "./builder/ContractBuilder.js";
import { Steps } from "./ContractCreator.js";
import { ModelPicker, defaultSource, sourceBlocks, sourceName, type ContractSource } from "./ModelPicker.js";

interface Props {
  companyId: string;
  /** Template being edited; null to create one. */
  initial: ContractTemplate | null;
  templates: ContractTemplate[];
  onSaved: () => void;
  onCancel: () => void;
}

export function TemplateEditor({ companyId, initial, templates, onSaved, onCancel }: Props) {
  const { active } = useCompany();
  const actionBar = useActionBar();
  const [step, setStep] = useState<1 | 2>(initial ? 2 : 1);
  const [source, setSource] = useState<ContractSource | null>(() => defaultSource(templates));
  const [name, setName] = useState(initial?.name ?? "");
  const [blocks, setBlocks] = useState<ContractBlock[]>(initial?.blocks ?? []);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.api.invoke("signatures:list", { companyId }).then(setSignatures);
  }, [companyId]);

  function next(src: ContractSource | null = source) {
    if (!src) return;
    setSource(src);
    setBlocks(sourceBlocks(src, templates));
    if (!name.trim()) {
      setName(src.kind === "template" ? `${sourceName(src, templates)} (copie)` : sourceName(src, templates));
    }
    setStep(2);
  }

  async function save(isDefault?: boolean) {
    setError(null);
    setBusy(true);
    const payload = { companyId, id: initial?.id ?? null, name: name.trim(), blocks, isDefault: isDefault ?? initial?.isDefault };
    try {
      if (initial) {
        await actionBar.track(`Modèle « ${payload.name} » modifié`, () =>
          window.api.invoke("contracts:saveTemplate", payload),
          onSaved,
        );
      } else {
        await window.api.invoke("contracts:saveTemplate", payload);
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
      {!initial && <Steps step={step} labels={["Choisir la structure", "Construire le modèle"]} />}
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
          <Field label="Nom du modèle">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contrat de prestation de services" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Les variables (<span className="font-mono">{"{{client}}"}</span>, montants, durées…) restent telles quelles dans
            le modèle : elles sont remplies à la création de chaque contrat.
          </p>
          <ContractBuilder
            blocks={blocks}
            onChange={setBlocks}
            signatures={signatures}
            preview={{
              variables: { ...DEFAULT_CONTRACT_VARIABLES, provider: active?.name ?? "" },
              providerName: active?.name ?? "",
              clientName: "Client d'exemple SA",
              oneOffAmountHt: null,
              monthlyAmountHt: null,
              minDurationMonths: null,
              signatures,
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>Annuler</Button>
            {!initial?.isDefault && (
              <Button variant="outline" onClick={() => void save(true)} disabled={!name.trim() || busy}>
                Enregistrer comme modèle par défaut
              </Button>
            )}
            <Button onClick={() => void save()} disabled={!name.trim() || busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
