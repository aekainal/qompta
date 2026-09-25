/**
 * Signatures: the handwritten signature of each shareholder who signs for the company.
 * They are printed at the bottom of quotes (signatory chosen on the quote, otherwise
 * the default one) and in the « Signatures » section of contracts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, ImageUp, PenLine, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { AssociateRecord } from "@shared/types.js";
import type { Signature } from "@shared/signatures.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Badge, Button, Card, Field, Input, Modal, Select } from "../../components/ui/primitives.js";
import { cn } from "../../lib/utils.js";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad.js";

export function SignaturesPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const [rows, setRows] = useState<Signature[]>([]);
  const [associates, setAssociates] = useState<AssociateRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();
  const dlg = useFormDialog<Signature>("signature");

  const load = useCallback(async () => {
    if (!companyId) return;
    const [s, a] = await Promise.all([
      window.api.invoke("signatures:list", { companyId }),
      window.api.invoke("associates:list", { companyId }),
    ]);
    setRows(s);
    setAssociates(a);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  function remove(s: Signature) {
    actionBar.defer(`Suppression de la signature de ${s.name}`, async () => {
      await window.api.invoke("signatures:remove", { companyId, id: s.id });
      await load();
    });
  }

  async function makeDefault(s: Signature) {
    setError(null);
    try {
      await actionBar.track(
        `${s.name} signe désormais par défaut`,
        () =>
          window.api.invoke("signatures:update", {
            companyId,
            id: s.id,
            data: { associateId: s.associateId, name: s.name, role: s.role, image: s.image, isDefault: true },
          }),
        load,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const associateName = (id: string | null) => associates.find((a) => a.id === id)?.name ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Signatures</h1>
          <p className="text-sm text-muted-foreground">
            Apposées au bas de vos devis et dans la section « Signatures » de vos contrats · {active.name}
          </p>
        </div>
        <Button onClick={() => dlg.open(null)}>
          <Plus size={16} /> Nouvelle signature
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {associates.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          Une signature se rattache à un associé : ajoutez d'abord les personnes qui signent
          dans « Associés ».
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <PenLine size={28} />
          <p>Aucune signature. Dessinez-la ou importez une image (PNG transparent idéalement).</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <Card key={s.id} className="overflow-hidden">
              <div className="flex h-32 items-center justify-center border-b bg-white p-3">
                <img src={s.image} alt={`Signature de ${s.name}`} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="truncate">{s.name}</span>
                    {s.isDefault && <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">Par défaut</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[s.role, associateName(s.associateId) ? `Associé : ${associateName(s.associateId)}` : "Associé supprimé"]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => void makeDefault(s)}
                    disabled={s.isDefault}
                    title="Signature par défaut"
                    aria-label="Définir par défaut"
                  >
                    <Star size={14} />
                  </Button>
                  <Button variant="ghost" className="h-7 px-2" onClick={() => dlg.open(s)} aria-label="Modifier">
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" className="h-7 px-2 text-destructive" onClick={() => remove(s)} aria-label="Supprimer">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal {...dlg.modalProps} title={dlg.item ? `Signature de ${dlg.item.name}` : "Nouvelle signature"} wide>
        {dlg.mounted && (
          <SignatureForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            associates={associates}
            onDraw={dlg.markDirty}
            onSaved={async (label) => {
              dlg.done();
              await load();
              if (label) actionBar.notify(label);
            }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}

const INKS = [
  { value: "#1a2a6c", label: "Bleu encre" },
  { value: "#111111", label: "Noir" },
];

function SignatureForm({
  companyId,
  initial,
  associates,
  onDraw,
  onSaved,
  onCancel,
}: {
  companyId: string;
  initial: Signature | null;
  associates: AssociateRecord[];
  onDraw: () => void;
  onSaved: (label?: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const actionBar = useActionBar();
  const first = associates[0];
  const [associateId, setAssociateId] = useState(initial?.associateId ?? first?.id ?? "");
  const [name, setName] = useState(initial?.name ?? first?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? first?.role ?? "");
  const [mode, setMode] = useState<"draw" | "image">(initial ? "image" : "draw");
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [ink, setInk] = useState(INKS[0].value);
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);

  function pickAssociate(id: string) {
    setAssociateId(id);
    const a = associates.find((x) => x.id === id);
    // Name and title follow the chosen shareholder, as long as they are not customized.
    if (a) {
      setName(a.name);
      setRole(a.role ?? "");
    }
  }

  async function importImage() {
    setError(null);
    try {
      const r = await window.api.invoke("signatures:pickImage", undefined as never);
      if ("image" in r) {
        setImage(r.image);
        onDraw();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function save() {
    setError(null);
    const finalImage = mode === "draw" ? pad.current?.toDataUrl() ?? null : image;
    if (!finalImage) {
      setError(mode === "draw" ? "Dessinez la signature dans le cadre." : "Importez une image.");
      return;
    }
    const data = { associateId: associateId || null, name: name.trim(), role: role.trim() || null, image: finalImage, isDefault };
    setBusy(true);
    try {
      if (initial) {
        await actionBar.track(`Signature de ${data.name} modifiée`, () =>
          window.api.invoke("signatures:update", { companyId, id: initial.id, data }),
        );
        await onSaved();
      } else {
        await window.api.invoke("signatures:create", { companyId, data });
        await onSaved(`Signature de ${data.name} ajoutée`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Associé qui signe">
          <Select value={associateId} onChange={(e) => pickAssociate(e.target.value)} className="w-full">
            <option value="">Aucun</option>
            {associates.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nom imprimé">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" />
        </Field>
        <Field label="Qualité (optionnel)">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Associé gérant" />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button variant={mode === "draw" ? "default" : "outline"} className="h-8" onClick={() => setMode("draw")}>
          <PenLine size={14} /> Dessiner
        </Button>
        <Button variant={mode === "image" ? "default" : "outline"} className="h-8" onClick={() => setMode("image")}>
          <ImageUp size={14} /> Image
        </Button>
      </div>

      {mode === "draw" ? (
        <div className="space-y-2">
          <SignaturePad ref={pad} color={ink} onDraw={onDraw} />
          <div className="flex items-center gap-3 text-sm">
            <Button variant="outline" className="h-8" onClick={() => pad.current?.clear()}>
              <Eraser size={14} /> Effacer
            </Button>
            {INKS.map((i) => (
              <button
                key={i.value}
                onClick={() => setInk(i.value)}
                className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs", ink === i.value ? "bg-accent font-medium" : "text-muted-foreground")}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: i.value }} /> {i.label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">Souris, stylet ou doigt. Le fond reste transparent.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed bg-white p-3">
            {image ? (
              <img src={image} alt="Signature" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-sm text-muted-foreground">Aucune image</span>
            )}
          </div>
          <Button variant="outline" className="h-8" onClick={() => void importImage()}>
            <ImageUp size={14} /> Choisir une image…
          </Button>
          <p className="text-xs text-muted-foreground">
            PNG à fond transparent de préférence (une signature scannée sur fond blanc fonctionne aussi). 1,5 Mo au plus.
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Signature par défaut (devis et nouveaux contrats)
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={busy || !name.trim()}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
