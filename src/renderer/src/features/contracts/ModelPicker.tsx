/**
 * Step 1 of creating a contract or a template: choose the starting STRUCTURE —
 * a template of the company (the default one is preselected) or a ready-made
 * structure from the catalogue. Step 2 then builds freely.
 */

import { Check, Star } from "lucide-react";
import { CONTRACT_MODELS } from "@shared/documents/contract-models.js";
import {
  cloneBlocks,
  withIds,
  type ContractBlock,
  type ContractBlockType,
} from "@shared/documents/contract-blocks.js";
import type { ContractTemplate } from "@shared/types.js";
import { cn } from "../../lib/utils.js";
import { BLOCK_ICONS } from "./builder/ContractBuilder.js";

export type ContractSource = { kind: "template"; id: string } | { kind: "model"; key: string };

export function sameSource(a: ContractSource | null, b: ContractSource): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind === "template" ? a.id === (b as { id: string }).id : a.key === (b as { key: string }).key;
}

/** Starting sections of a source, with fresh identifiers. */
export function sourceBlocks(src: ContractSource, templates: ContractTemplate[]): ContractBlock[] {
  if (src.kind === "template") {
    return cloneBlocks(templates.find((t) => t.id === src.id)?.blocks ?? []);
  }
  return withIds(CONTRACT_MODELS.find((m) => m.key === src.key)?.blocks ?? []);
}

export function sourceName(src: ContractSource, templates: ContractTemplate[]): string {
  return src.kind === "template"
    ? (templates.find((t) => t.id === src.id)?.name ?? "Modèle")
    : (CONTRACT_MODELS.find((m) => m.key === src.key)?.name ?? "Structure");
}

/** Preselected source: the company's default template, otherwise the Qwasar structure. */
export function defaultSource(templates: ContractTemplate[]): ContractSource {
  const def = templates.find((t) => t.isDefault) ?? templates[0];
  return def ? { kind: "template", id: def.id } : { kind: "model", key: CONTRACT_MODELS[0].key };
}

/** Icons of a template's section types, in order, without successive duplicates. */
function Outline({ types }: { types: ContractBlockType[] }) {
  const compact = types.filter((t, i) => t !== types[i - 1]);
  return (
    <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
      {compact.slice(0, 14).map((t, i) => {
        const Icon = BLOCK_ICONS[t];
        return <Icon key={i} size={12} />;
      })}
      {compact.length > 14 && <span className="text-[10px]">…</span>}
    </div>
  );
}

function SourceCard({
  selected,
  onClick,
  title,
  description,
  count,
  types,
  badges,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  count: number;
  types: ContractBlockType[];
  badges: string[];
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/60",
        selected && "border-primary ring-2 ring-primary/30",
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check size={12} />
        </span>
      )}
      <div className="pr-6 font-medium">{title}</div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {badges.map((b) => (
          <span key={b} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">{b}</span>
        ))}
        <span className="text-[11px] text-muted-foreground">{count} section(s)</span>
      </div>
      <Outline types={types} />
    </button>
  );
}

export function ModelPicker({
  templates,
  value,
  onChange,
  onPickDouble,
}: {
  templates: ContractTemplate[];
  value: ContractSource | null;
  onChange: (src: ContractSource) => void;
  /** Double click: choose and go straight to the next step. */
  onPickDouble?: (src: ContractSource) => void;
}) {
  return (
    <div className="space-y-5">
      {templates.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Vos modèles</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const src: ContractSource = { kind: "template", id: t.id };
              return (
                <div key={t.id} onDoubleClick={() => onPickDouble?.(src)} className="flex">
                  <SourceCard
                    selected={sameSource(value, src)}
                    onClick={() => onChange(src)}
                    title={t.name}
                    count={t.blocks.length}
                    types={t.blocks.map((b) => b.type)}
                    badges={t.isDefault ? ["Par défaut"] : []}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Star size={14} /> Structures prêtes à l'emploi
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {CONTRACT_MODELS.map((m) => {
            const src: ContractSource = { kind: "model", key: m.key };
            return (
              <div key={m.key} onDoubleClick={() => onPickDouble?.(src)} className="flex">
                <SourceCard
                  selected={sameSource(value, src)}
                  onClick={() => onChange(src)}
                  title={m.name}
                  description={m.description}
                  count={m.blocks.length}
                  types={m.blocks.map((b) => b.type)}
                  badges={m.tags}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
