/**
 * «Objectifs» view: rich catalogue of management targets, tracked in real time.
 * Every target is recomputed from the data; nothing is frozen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import {
  CATEGORY_LABELS,
  METRIC_CATALOG,
  metricDef,
  targetFromInput,
  targetToInput,
  type Objective,
  type ObjectiveCategory,
  type ObjectiveDirection,
  type ObjectiveInput,
  type ObjectiveMetric,
  type ObjectivePeriodType,
  type ObjectiveProgress,
} from "@shared/objectives.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Button, Card, Field, Input, Modal, Select } from "../../components/ui/primitives.js";
import { ObjectiveBar } from "./parts.js";

const CATEGORIES: ObjectiveCategory[] = ["finance", "sales", "clients", "funds"];
const CURRENT_YEAR = new Date().getFullYear();

export function ObjectivesView({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<ObjectiveProgress[]>([]);
  const dlg = useFormDialog<Objective>("objectif");
  const actionBar = useActionBar();

  const load = useCallback(async () => {
    setItems(await window.api.invoke("dashboard:objectives", { companyId }));
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(
    () =>
      CATEGORIES.map((cat) => ({
        cat,
        items: items.filter((p) => metricDef(p.objective.metric).category === cat),
      })).filter((g) => g.items.length > 0),
    [items],
  );

  function remove(o: Objective) {
    actionBar.defer("Suppression de l'objectif", async () => {
      await window.api.invoke("objectives:delete", { companyId, id: o.id });
      await load();
    });
  }

  const metCount = items.filter((p) => p.met).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "Aucun objectif pour l'instant."
              : `${metCount}/${items.length} objectif${items.length > 1 ? "s" : ""} atteint${metCount > 1 ? "s" : ""}.`}
          </p>
        </div>
        <Button onClick={() => dlg.open(null)}>
          <Plus size={16} /> Nouvel objectif
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Target className="text-muted-foreground" size={28} />
          <p className="max-w-md text-sm text-muted-foreground">
            Fixez des cibles (chiffre d'affaires, résultat, devis gagnés, nouveaux clients,
            revenu récurrent…) et suivez leur progression, ici et sur chaque tableau de bord.
          </p>
          <Button onClick={() => dlg.open(null)}>
            <Plus size={16} /> Créer un premier objectif
          </Button>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.cat}>
              <h2 className="mb-2 text-sm font-semibold">{CATEGORY_LABELS[g.cat]}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {g.items.map((p) => (
                  <Card key={p.objective.id} className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <ObjectiveBar p={p} />
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" className="h-7 px-2" title="Modifier" onClick={() => dlg.open(p.objective)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" className="h-7 px-2 text-destructive" title="Supprimer" onClick={() => remove(p.objective)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal {...dlg.modalProps} title={dlg.item ? "Modifier l'objectif" : "Nouvel objectif"}>
        {dlg.mounted && (
          <ObjectiveForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            onSaved={() => { dlg.done(); void load(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}

function unitHint(metric: ObjectiveMetric): string {
  const u = metricDef(metric).unit;
  return u === "money" ? "CHF (HT)" : u === "rate" ? "%" : "nombre";
}

function ObjectiveForm({ companyId, initial, onSaved, onCancel }: {
  companyId: string;
  initial: Objective | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [metric, setMetric] = useState<ObjectiveMetric>(initial?.metric ?? "revenue_invoiced");
  const [periodType, setPeriodType] = useState<ObjectivePeriodType>(initial?.periodType ?? "year");
  const [periodYear, setPeriodYear] = useState(initial?.periodYear ?? CURRENT_YEAR);
  const [periodQuarter, setPeriodQuarter] = useState(initial?.periodQuarter ?? 1);
  const [periodMonth, setPeriodMonth] = useState(initial?.periodMonth ?? 1);
  const [direction, setDirection] = useState<ObjectiveDirection>(
    initial?.direction ?? metricDef(metric).defaultDirection,
  );
  const def = metricDef(metric);
  const [target, setTarget] = useState(
    initial ? String(targetToInput(def.unit, initial.targetValue)) : "",
  );
  const [label, setLabel] = useState(initial?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  // Changing metric realigns the default direction (revenue is aimed at as a floor).
  function onMetric(m: ObjectiveMetric) {
    setMetric(m);
    setDirection(metricDef(m).defaultDirection);
  }

  async function save() {
    setError(null);
    const numeric = Number(target.replace(/['’\s]/g, "").replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Cible attendue : un nombre supérieur à zéro.");
      return;
    }
    const data: ObjectiveInput = {
      metric,
      periodType,
      periodYear,
      periodQuarter: periodType === "quarter" ? periodQuarter : null,
      periodMonth: periodType === "month" ? periodMonth : null,
      targetValue: targetFromInput(def.unit, numeric),
      direction,
      label: label.trim() || null,
    };
    try {
      if (initial) {
        await actionBar.track(
          "Objectif modifié",
          () => window.api.invoke("objectives:update", { companyId, id: initial.id, data }),
          onSaved,
        );
      } else await window.api.invoke("objectives:create", { companyId, data });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Métrique">
        <Select value={metric} onChange={(e) => onMetric(e.target.value as ObjectiveMetric)} className="w-full">
          {CATEGORIES.map((cat) => (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {METRIC_CATALOG.filter((m) => m.category === cat).map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      {def.hint && <p className="text-xs text-muted-foreground">{def.hint}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Période">
          <Select value={periodType} onChange={(e) => setPeriodType(e.target.value as ObjectivePeriodType)} className="w-full">
            <option value="year">Année entière</option>
            <option value="quarter">Trimestre</option>
            <option value="month">Mois</option>
          </Select>
        </Field>
        <Field label="Année">
          <Select value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))} className="w-full">
            {[CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </Field>
      </div>

      {periodType === "quarter" && (
        <Field label="Trimestre">
          <Select value={periodQuarter} onChange={(e) => setPeriodQuarter(Number(e.target.value))} className="w-full">
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>T{q}</option>)}
          </Select>
        </Field>
      )}
      {periodType === "month" && (
        <Field label="Mois">
          <Select value={periodMonth} onChange={(e) => setPeriodMonth(Number(e.target.value))} className="w-full">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Cible (${unitHint(metric)})`}>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={def.unit === "money" ? "50000" : def.unit === "rate" ? "80" : "10"} />
        </Field>
        <Field label="Sens">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as ObjectiveDirection)} className="w-full">
            <option value="at_least">Atteindre au moins (≥)</option>
            <option value="at_most">Ne pas dépasser (≤)</option>
          </Select>
        </Field>
      </div>

      <Field label="Libellé (optionnel)">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={def.label} />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={!target.trim()}>Enregistrer</Button>
      </div>
    </div>
  );
}
