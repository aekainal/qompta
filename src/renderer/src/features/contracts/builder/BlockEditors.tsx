/**
 * Editors for each section type of the contract builder.
 * An editor receives its section and returns the changed section via `onChange`.
 */

import { Plus, X } from "lucide-react";
import type {
  ContractBlock,
  ListBlock,
  SignaturesBlock,
  TableBlock,
} from "@shared/documents/contract-blocks.js";
import type { Signature } from "@shared/signatures.js";
import { Button, Field, Input, Select, Textarea } from "../../../components/ui/primitives.js";
import { cn } from "../../../lib/utils.js";

/** Text area height that follows the content, without ever becoming invasive. */
function rowsFor(text: string, min = 3): number {
  const lines = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 95)), 0);
  return Math.min(14, Math.max(min, lines));
}

interface EditorProps<B extends ContractBlock> {
  block: B;
  onChange: (b: B) => void;
  readOnly?: boolean;
  signatures: Signature[];
}

export function BlockEditor(props: EditorProps<ContractBlock>) {
  const { block, onChange, readOnly } = props;
  switch (block.type) {
    case "article":
      return (
        <div className="space-y-2">
          <Input
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="Titre de l'article (obligatoire)"
            readOnly={readOnly}
            className="font-medium"
          />
          <Textarea
            value={block.body}
            rows={rowsFor(block.body)}
            onChange={(e) => onChange({ ...block, body: e.target.value })}
            placeholder="Texte de l'article"
            readOnly={readOnly}
          />
        </div>
      );
    case "heading":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Input
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="Conditions particulières"
            readOnly={readOnly}
            className="font-semibold uppercase"
          />
          <Input
            value={block.subtitle}
            onChange={(e) => onChange({ ...block, subtitle: e.target.value })}
            placeholder="Sous-titre (facultatif)"
            readOnly={readOnly}
          />
        </div>
      );
    case "text":
      return (
        <Textarea
          value={block.body}
          rows={rowsFor(block.body, 2)}
          onChange={(e) => onChange({ ...block, body: e.target.value })}
          placeholder="Paragraphe libre (préambule, remarque…)"
          readOnly={readOnly}
        />
      );
    case "callout":
      return (
        <div className="space-y-2 border-l-4 border-primary pl-3">
          <Input
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="Titre de l'encadré (facultatif)"
            readOnly={readOnly}
          />
          <Textarea
            value={block.body}
            rows={rowsFor(block.body, 2)}
            onChange={(e) => onChange({ ...block, body: e.target.value })}
            placeholder="Texte mis en évidence"
            readOnly={readOnly}
          />
        </div>
      );
    case "list":
      return <ListEditor {...props} block={block} onChange={onChange as (b: ListBlock) => void} />;
    case "table":
      return <TableEditor {...props} block={block} onChange={onChange as (b: TableBlock) => void} />;
    case "parties":
      return (
        <div className="space-y-2">
          <Input
            value={block.intro}
            onChange={(e) => onChange({ ...block, intro: e.target.value })}
            placeholder="Entre les soussignés :"
            readOnly={readOnly}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Votre société est appelée">
              <Input
                value={block.providerLabel}
                onChange={(e) => onChange({ ...block, providerLabel: e.target.value })}
                readOnly={readOnly}
              />
            </Field>
            <Field label="Le client est appelé">
              <Input
                value={block.clientLabel}
                onChange={(e) => onChange({ ...block, clientLabel: e.target.value })}
                readOnly={readOnly}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Noms et adresses des deux parties sont repris automatiquement de la société et du client.
          </p>
        </div>
      );
    case "commitments":
      return (
        <p className="text-sm text-muted-foreground">
          Tableau récapitulatif rempli avec les montants du contrat (ponctuel, mensuel, durée
          d'engagement, TVA). Aucun réglage.
        </p>
      );
    case "signatures":
      return <SignaturesEditor {...props} block={block} onChange={onChange as (b: SignaturesBlock) => void} />;
    case "pageBreak":
      return <p className="text-sm text-muted-foreground">La suite du contrat commence sur une nouvelle page.</p>;
  }
}

function ListEditor({ block, onChange, readOnly }: EditorProps<ListBlock>) {
  const setItem = (i: number, value: string) =>
    onChange({ ...block, items: block.items.map((it, j) => (j === i ? value : it)) });
  const insertAfter = (i: number) =>
    onChange({ ...block, items: [...block.items.slice(0, i + 1), "", ...block.items.slice(i + 1)] });
  const remove = (i: number) => onChange({ ...block, items: block.items.filter((_, j) => j !== i) });
  const marker = (i: number) =>
    block.style === "number" ? `${i + 1}.` : block.style === "letter" ? `${String.fromCharCode(97 + (i % 26))})` : "•";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          placeholder="Titre (facultatif — sans titre, pas de numéro)"
          readOnly={readOnly}
          className="min-w-[220px] flex-1 font-medium"
        />
        <Select
          value={block.style}
          onChange={(e) => onChange({ ...block, style: e.target.value as ListBlock["style"] })}
          disabled={readOnly}
        >
          <option value="bullet">• Puces</option>
          <option value="number">1. Numéros</option>
          <option value="letter">a) Lettres</option>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={block.numbered}
            disabled={readOnly}
            onChange={(e) => onChange({ ...block, numbered: e.target.checked })}
          />
          Numéroter comme article
        </label>
      </div>
      <Input
        value={block.intro}
        onChange={(e) => onChange({ ...block, intro: e.target.value })}
        placeholder="Phrase d'introduction (facultatif)"
        readOnly={readOnly}
      />
      <div className="space-y-1.5">
        {block.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-sm text-muted-foreground">{marker(i)}</span>
            <Input
              value={item}
              onChange={(e) => setItem(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !readOnly) {
                  e.preventDefault();
                  insertAfter(i);
                }
              }}
              placeholder="Élément de la liste (Entrée pour en ajouter un)"
              readOnly={readOnly}
            />
            {!readOnly && (
              <Button variant="ghost" className="h-8 px-2" onClick={() => remove(i)} aria-label="Retirer l'élément">
                <X size={14} />
              </Button>
            )}
          </div>
        ))}
        {!readOnly && (
          <Button variant="ghost" className="h-7 text-xs" onClick={() => insertAfter(block.items.length - 1)}>
            <Plus size={13} /> Élément
          </Button>
        )}
      </div>
    </div>
  );
}

function TableEditor({ block, onChange, readOnly }: EditorProps<TableBlock>) {
  const setRow = (i: number, patch: Partial<TableBlock["rows"][number]>) =>
    onChange({ ...block, rows: block.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          placeholder="Titre du tableau (Tarifs, Échéancier…)"
          readOnly={readOnly}
          className="min-w-[220px] flex-1 font-medium"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={block.numbered}
            disabled={readOnly}
            onChange={(e) => onChange({ ...block, numbered: e.target.checked })}
          />
          Numéroter comme article
        </label>
      </div>
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-px bg-border">
          <Input
            value={block.headers[0]}
            onChange={(e) => onChange({ ...block, headers: [e.target.value, block.headers[1]] })}
            placeholder="En-tête colonne 1 (facultatif)"
            readOnly={readOnly}
            className="rounded-none border-0 bg-muted/60 text-xs font-semibold"
          />
          <Input
            value={block.headers[1]}
            onChange={(e) => onChange({ ...block, headers: [block.headers[0], e.target.value] })}
            placeholder="En-tête colonne 2"
            readOnly={readOnly}
            className="rounded-none border-0 bg-muted/60 text-xs font-semibold"
          />
          <div className="w-9 bg-muted/60" />
          {block.rows.map((r, i) => (
            <RowCells
              key={i}
              label={r.label}
              value={r.value}
              readOnly={readOnly}
              onLabel={(v) => setRow(i, { label: v })}
              onValue={(v) => setRow(i, { value: v })}
              onRemove={() => onChange({ ...block, rows: block.rows.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      </div>
      {!readOnly && (
        <Button
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => onChange({ ...block, rows: [...block.rows, { label: "", value: "" }] })}
        >
          <Plus size={13} /> Ligne
        </Button>
      )}
    </div>
  );
}

function RowCells({
  label,
  value,
  readOnly,
  onLabel,
  onValue,
  onRemove,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  onLabel: (v: string) => void;
  onValue: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <Input value={label} onChange={(e) => onLabel(e.target.value)} readOnly={readOnly} className="rounded-none border-0 font-medium" placeholder="Libellé" />
      <Input value={value} onChange={(e) => onValue(e.target.value)} readOnly={readOnly} className="rounded-none border-0" placeholder="Valeur" />
      <div className="flex w-9 items-center justify-center bg-background">
        {!readOnly && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive" aria-label="Retirer la ligne">
            <X size={14} />
          </button>
        )}
      </div>
    </>
  );
}

function SignaturesEditor({ block, onChange, readOnly, signatures }: EditorProps<SignaturesBlock>) {
  function toggle(id: string) {
    const has = block.signatureIds.includes(id);
    onChange({
      ...block,
      signatureIds: has ? block.signatureIds.filter((s) => s !== id) : [...block.signatureIds, id],
    });
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-2 rounded-md border p-3">
        <Field label="Votre côté — intitulé">
          <Input
            value={block.providerTitle}
            onChange={(e) => onChange({ ...block, providerTitle: e.target.value })}
            readOnly={readOnly}
          />
        </Field>
        <div className="text-xs font-medium text-muted-foreground">Signé par</div>
        {signatures.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucune signature enregistrée : une ligne sera laissée à signer à la main. Créez vos
            signatures dans « Associés & fonds › Signatures ».
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {signatures.map((s) => {
              const on = block.signatureIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  disabled={readOnly}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "flex w-36 flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors",
                    on ? "border-primary bg-primary/10" : "opacity-70 hover:opacity-100",
                  )}
                >
                  <span className="flex h-10 w-full items-center justify-center rounded bg-white">
                    <img src={s.image} alt="" className="max-h-full max-w-full object-contain" />
                  </span>
                  <span className="truncate font-medium">{s.name}</span>
                </button>
              );
            })}
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={block.placeDate}
            disabled={readOnly}
            onChange={(e) => onChange({ ...block, placeDate: e.target.checked })}
          />
          Ligne « Fait à …, le … » au-dessus des signatures
        </label>
      </div>
      <div className="space-y-2 rounded-md border p-3">
        <Field label="Côté client — intitulé">
          <Input
            value={block.clientTitle}
            onChange={(e) => onChange({ ...block, clientTitle: e.target.value })}
            readOnly={readOnly}
          />
        </Field>
        <Field label="Mention manuscrite demandée">
          <Input
            value={block.clientMention}
            onChange={(e) => onChange({ ...block, clientMention: e.target.value })}
            placeholder="Lu et approuvé, bon pour accord"
            readOnly={readOnly}
          />
        </Field>
        <Field label="Signataires côté client">
          <Select
            value={String(block.clientSignatories)}
            disabled={readOnly}
            onChange={(e) => onChange({ ...block, clientSignatories: Number(e.target.value) })}
          >
            <option value="1">1 signataire</option>
            <option value="2">2 signataires</option>
            <option value="3">3 signataires</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}
