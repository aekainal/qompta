/**
 * Contract builder: a list of typed sections that are added, filled in, moved
 * (arrows or drag and drop), duplicated, collapsed and deleted — with a preview
 * that resolves the variables live.
 *
 * Deleting a section goes through the action bar ("Annuler" puts it back).
 */

import { useRef, useState, type ReactNode } from "react";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Braces,
  ChevronDown,
  ChevronRight,
  Coins,
  CopyPlus,
  Eye,
  FileText,
  GripVertical,
  Hammer,
  Heading,
  Info,
  List,
  PenLine,
  Plus,
  SeparatorHorizontal,
  Table,
  Trash2,
  Users,
} from "lucide-react";
import {
  BLOCK_TYPES,
  articleNumbers,
  blockLabel,
  cloneBlocks,
  emptyBlock,
  type ContractBlock,
  type ContractBlockType,
} from "@shared/documents/contract-blocks.js";
import { CONTRACT_VARIABLE_HELP } from "@shared/documents/contract-template.js";
import type { Signature } from "@shared/signatures.js";
import { useActionBar } from "../../../app/ActionBarContext.js";
import { Button } from "../../../components/ui/primitives.js";
import { cn } from "../../../lib/utils.js";
import { BlockEditor } from "./BlockEditors.js";
import { ContractPreview, type PreviewContext } from "./ContractPreview.js";

export const BLOCK_ICONS: Record<ContractBlockType, typeof FileText> = {
  article: FileText,
  heading: Heading,
  text: AlignLeft,
  list: List,
  table: Table,
  callout: Info,
  parties: Users,
  commitments: Coins,
  signatures: PenLine,
  pageBreak: SeparatorHorizontal,
};

/** Summary of a collapsed section. */
function summary(b: ContractBlock): string {
  switch (b.type) {
    case "article":
    case "callout":
      return b.title || b.body.slice(0, 80);
    case "heading":
      return b.title;
    case "text":
      return b.body.slice(0, 80);
    case "list":
      return b.title || `${b.items.filter(Boolean).length} élément(s)`;
    case "table":
      return b.title || `${b.rows.length} ligne(s)`;
    case "signatures":
      return `${b.signatureIds.length || "aucune"} signature(s) de votre côté · ${b.clientSignatories} côté client`;
    default:
      return "";
  }
}

interface Props {
  blocks: ContractBlock[];
  onChange: (blocks: ContractBlock[]) => void;
  readOnly?: boolean;
  signatures: Signature[];
  preview: PreviewContext;
  /** Do the `{{…}}` variables make sense here (template or contract in progress)? */
  showVariables?: boolean;
}

export function ContractBuilder({ blocks, onChange, readOnly, signatures, preview, showVariables = true }: Props) {
  const actionBar = useActionBar();
  const [tab, setTab] = useState<"build" | "preview">("build");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  /** Last active text field: that is where a variable gets inserted. */
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const numbers = articleNumbers(blocks);

  const update = (i: number, b: ContractBlock) => onChange(blocks.map((x, j) => (j === i ? b : x)));

  function insert(type: ContractBlockType, at: number) {
    const b = emptyBlock(type);
    if (b.type === "signatures") {
      const def = signatures.find((s) => s.isDefault) ?? signatures[0];
      if (def) b.signatureIds = [def.id];
    }
    onChange([...blocks.slice(0, at), b, ...blocks.slice(at)]);
    setInsertAt(null);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= blocks.length || from === to) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function remove(i: number) {
    const before = blocks;
    const removed = blocks[i];
    onChange(blocks.filter((_, j) => j !== i));
    actionBar.undoable(`Section « ${blockLabel(removed.type)} » supprimée`, () => onChange(before));
  }

  function duplicate(i: number) {
    const [copy] = cloneBlocks([blocks[i]]);
    onChange([...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)]);
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Inserts `{{key}}` at the caret position in the last field used. */
  function insertVariable(key: string) {
    const el = lastField.current;
    if (!el || !document.body.contains(el)) {
      actionBar.notify("Cliquez d'abord dans le texte où insérer la variable.");
      return;
    }
    el.focus();
    // execCommand goes through the normal event path: React sees the input.
    document.execCommand("insertText", false, `{{${key}}}`);
  }

  const allCollapsed = blocks.length > 0 && blocks.every((b) => collapsed.has(b.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border p-0.5">
          <TabButton active={tab === "build"} onClick={() => setTab("build")}>
            <Hammer size={14} /> Construire
          </TabButton>
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
            <Eye size={14} /> Aperçu
          </TabButton>
        </div>
        {tab === "build" && blocks.length > 0 && (
          <Button
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(blocks.map((b) => b.id)))}
          >
            {allCollapsed ? "Tout déplier" : "Tout replier"}
          </Button>
        )}
      </div>

      {tab === "preview" ? (
        <ContractPreview blocks={blocks} ctx={preview} />
      ) : (
        <>
          {showVariables && !readOnly && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
              <Braces size={13} className="text-muted-foreground" />
              <span className="text-muted-foreground">Insérer :</span>
              {CONTRACT_VARIABLE_HELP.map((v) => (
                <button
                  key={v.key}
                  // mousedown prevented: the field keeps focus and the caret position.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertVariable(v.key)}
                  className="rounded border bg-background px-1.5 py-0.5 hover:border-primary"
                  title={`{{${v.key}}}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          <div
            className="space-y-2"
            onFocusCapture={(e) => {
              const t = e.target;
              if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === "text")) {
                lastField.current = t;
              }
            }}
          >
            {!readOnly && (
              <InsertSlot
                open={insertAt === 0}
                onOpen={() => setInsertAt(insertAt === 0 ? null : 0)}
                onPick={(t) => insert(t, 0)}
                last={blocks.length === 0}
              />
            )}
            {blocks.map((b, i) => {
              const Icon = BLOCK_ICONS[b.type];
              const isCollapsed = collapsed.has(b.id);
              return (
                <div key={b.id}>
                  <div
                    className={cn(
                      "rounded-lg border bg-card transition-shadow",
                      dragOver === i && dragFrom !== null && dragFrom !== i && "ring-2 ring-primary",
                      b.type === "pageBreak" && "border-dashed",
                    )}
                    onDragOver={(e) => {
                      if (dragFrom === null) return;
                      e.preventDefault();
                      setDragOver(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom !== null) move(dragFrom, i);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                  >
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      {!readOnly && (
                        <span
                          draggable
                          onDragStart={(e) => {
                            setDragFrom(i);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragFrom(null);
                            setDragOver(null);
                          }}
                          className="cursor-grab text-muted-foreground active:cursor-grabbing"
                          title="Glisser pour déplacer"
                        >
                          <GripVertical size={16} />
                        </span>
                      )}
                      <button onClick={() => toggle(b.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <Icon size={15} className="shrink-0 text-primary" />
                        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {numbers[i] != null ? `Art. ${numbers[i]} · ` : ""}
                          {blockLabel(b.type)}
                        </span>
                        {isCollapsed && <span className="truncate text-sm">{summary(b)}</span>}
                      </button>
                      {!readOnly && (
                        <div className="flex shrink-0 gap-0.5">
                          <IconButton label="Monter" onClick={() => move(i, i - 1)} disabled={i === 0}><ArrowUp size={14} /></IconButton>
                          <IconButton label="Descendre" onClick={() => move(i, i + 1)} disabled={i === blocks.length - 1}><ArrowDown size={14} /></IconButton>
                          <IconButton label="Dupliquer" onClick={() => duplicate(i)}><CopyPlus size={14} /></IconButton>
                          <IconButton label="Supprimer" onClick={() => remove(i)} danger><Trash2 size={14} /></IconButton>
                        </div>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="border-t px-3 pb-3 pt-2">
                        <BlockEditor block={b} onChange={(nb) => update(i, nb)} readOnly={readOnly} signatures={signatures} />
                      </div>
                    )}
                  </div>
                  {!readOnly && (
                    <InsertSlot
                      open={insertAt === i + 1}
                      onOpen={() => setInsertAt(insertAt === i + 1 ? null : i + 1)}
                      onPick={(t) => insert(t, i + 1)}
                      last={i === blocks.length - 1}
                    />
                  )}
                </div>
              );
            })}
            {blocks.length === 0 && readOnly && (
              <p className="py-2 text-center text-sm text-muted-foreground">Aucune section.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      className={cn("h-7 px-1.5", danger && "text-destructive")}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

/** Insertion point between two sections: a thin "+" line that opens the catalogue. */
function InsertSlot({
  open,
  onOpen,
  onPick,
  last,
}: {
  open: boolean;
  onOpen: () => void;
  onPick: (type: ContractBlockType) => void;
  last?: boolean;
}) {
  return (
    <div className={cn("group relative", last ? "pt-2" : "py-0.5")}>
      {last ? (
        <Button variant="outline" className="w-full border-dashed" onClick={onOpen}>
          <Plus size={15} /> Ajouter une section
        </Button>
      ) : (
        <button
          onClick={onOpen}
          className={cn(
            "flex h-4 w-full items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100",
            open && "opacity-100",
          )}
          aria-label="Insérer une section ici"
        >
          <span className="h-px flex-1 bg-primary/40" />
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus size={11} />
          </span>
          <span className="h-px flex-1 bg-primary/40" />
        </button>
      )}
      {open && (
        <div className="mt-1 grid grid-cols-1 gap-1 rounded-lg border bg-card p-2 shadow-lg sm:grid-cols-2">
          {BLOCK_TYPES.map((t) => {
            const Icon = BLOCK_ICONS[t.type];
            return (
              <button
                key={t.type}
                onClick={() => onPick(t.type)}
                className="flex items-start gap-2 rounded-md p-2 text-left hover:bg-accent"
              >
                <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
