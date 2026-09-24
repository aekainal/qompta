/**
 * Branding of the PDF documents, per company.
 *
 * Everything visual about quotes, invoices and contracts is set here:
 * logo (text or image), color, decorative pattern, contact line, signatures.
 * The default values are the original QWASAR template — a company that leaves
 * them alone prints exactly as before.
 */

import { useCallback, useEffect, useState } from "react";
import { Eye, ImageIcon, RotateCcw, Trash2, Type, Upload } from "lucide-react";
import {
  BRAND_LIMITS,
  DEFAULT_BRAND,
  dmmToMm,
  type BrandSettings,
  type FontMode,
  type LogoMode,
  type PatternMode,
} from "@shared/brand.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { Button, Card, Field, Input, Label, Select } from "../../components/ui/primitives.js";

/** Colors offered in one click; any other value can still be typed in. */
const SWATCHES = ["#3b82f6", "#0f172a", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function BrandPage() {
  const { active, reload } = useCompany();
  const companyId = active?.id ?? "";
  const actionBar = useActionBar();

  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  // Text logo and color live on the company: they are used elsewhere too.
  const [logoText, setLogoText] = useState("");
  const [color, setColor] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !active) return;
    setBrand(await window.api.invoke("brand:get", { companyId }));
    setLogoText(active.logoText ?? "");
    setColor(active.color ?? "");
    setDirty(false);
  }, [companyId, active]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  function patch(p: Partial<BrandSettings>) {
    setBrand((b) => ({ ...b, ...p }));
    setDirty(true);
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      // Branding and text logo/color form a single undoable change.
      await actionBar.track(
        "Apparence enregistrée",
        async () => {
          await window.api.invoke("brand:update", { companyId, data: brand });
          await window.api.invoke("companies:update", {
            id: companyId,
            logoText: logoText.trim() || null,
            color: color.trim() || null,
          });
        },
        async () => {
          await reload();
          await load();
        },
      );
      await reload();
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function pickLogo() {
    setError(null);
    try {
      const res = await window.api.invoke("brand:pickLogo", undefined as never);
      if ("canceled" in res) return;
      patch({ logoImage: res.image, logoMode: "image" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function pickFont() {
    setError(null);
    try {
      const res = await window.api.invoke("brand:pickFont", undefined as never);
      if ("canceled" in res) return;
      // The chosen files add to the weights already in place (regular then bold…).
      const faces = [...brand.fontFaces, ...res.faces].slice(0, BRAND_LIMITS.maxFontFaces);
      patch({ fontFaces: faces, fontMode: "custom" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function preview() {
    setError(null);
    setBusy(true);
    try {
      await window.api.invoke("brand:preview", { companyId, data: brand });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  function resetToTemplate() {
    actionBar.defer("Retour au gabarit d'origine", async () => {
      await window.api.invoke("brand:reset", { companyId });
      await load();
    });
  }

  const effectiveLogoText = logoText.trim() || active.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Apparence des documents</h1>
          <p className="text-sm text-muted-foreground">
            Devis, factures et contrats — {active.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void preview()} disabled={busy}>
            <Eye size={16} /> Aperçu
          </Button>
          <Button variant="outline" onClick={resetToTemplate} disabled={busy}>
            <RotateCcw size={16} /> Gabarit d'origine
          </Button>
          <Button onClick={() => void save()} disabled={busy || !dirty}>Enregistrer</Button>
        </div>
      </div>

      <Card className="p-4 text-sm text-muted-foreground">
        Ces réglages ne concernent que <strong>{active.name}</strong>. Chaque société a les
        siens : changer l'apparence ici ne touche à aucune autre. L'aperçu ouvre un document
        d'exemple avec les réglages en cours, avant même de les enregistrer.
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Logo ── */}
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Logo</h2>

          <Field label="Type de logo">
            <Select
              className="w-full"
              value={brand.logoMode}
              onChange={(e) => patch({ logoMode: e.target.value as LogoMode })}
            >
              <option value="text">Texte (comme QWASAR)</option>
              <option value="image">Image</option>
              <option value="none">Aucun logo</option>
            </Select>
          </Field>

          {brand.logoMode === "text" && (
            <Field label="Texte du logo">
              <Input
                value={logoText}
                onChange={(e) => { setLogoText(e.target.value); setDirty(true); }}
                placeholder={active.name}
              />
            </Field>
          )}

          {brand.logoMode === "image" && (
            <div className="space-y-2">
              <Label>Image</Label>
              {brand.logoImage ? (
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <img
                    src={brand.logoImage}
                    alt="Logo"
                    className="max-h-16 max-w-[45%] object-contain"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="h-8" onClick={() => void pickLogo()}>
                      <Upload size={14} /> Remplacer
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8 text-destructive"
                      onClick={() => patch({ logoImage: null, logoMode: "text" })}
                    >
                      <Trash2 size={14} /> Retirer
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" onClick={() => void pickLogo()}>
                  <ImageIcon size={16} /> Choisir une image…
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                PNG, JPEG, SVG ou WebP, {BRAND_LIMITS.logoImageBytes / 1024 / 1024} Mo maximum.
                L'image est enregistrée dans la base : elle suit les sauvegardes et s'imprime
                hors ligne.
              </p>
            </div>
          )}

          {brand.logoMode !== "none" && (
            <Field label={`Hauteur du logo : ${dmmToMm(brand.logoHeightDmm).toFixed(1)} mm`}>
              <input
                type="range"
                min={BRAND_LIMITS.logoHeightDmm.min}
                max={BRAND_LIMITS.logoHeightDmm.max}
                value={brand.logoHeightDmm}
                onChange={(e) => patch({ logoHeightDmm: Number(e.target.value) })}
                className="w-full accent-[var(--accent-color)]"
                style={{ ["--accent-color" as string]: color || DEFAULT_BRAND_FALLBACK }}
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={brand.showContact}
              onChange={(e) => patch({ showContact: e.target.checked })}
            />
            Afficher l'e-mail de contact sous le logo
          </label>
          {brand.showContact && !active.email && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Aucun e-mail n'est renseigné sur la société : la ligne restera vide.
            </p>
          )}
        </Card>

        {/* ── Color ── */}
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Couleur de marque</h2>
          <p className="text-xs text-muted-foreground">
            Elle habille le logo, l'e-mail de contact et le motif. Le reste du document
            reste en noir, pour rester lisible à l'impression.
          </p>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => { setColor(c); setDirty(true); }}
                aria-label={c}
                className={`h-8 w-8 rounded-full border-2 ${color.toLowerCase() === c ? "border-foreground" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="grid grid-cols-[auto_1fr] items-end gap-3">
            <Field label="Personnalisée">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_BRAND_FALLBACK}
                onChange={(e) => { setColor(e.target.value); setDirty(true); }}
                className="h-9 w-16 cursor-pointer rounded-md border bg-background"
              />
            </Field>
            <Field label="Code hexadécimal">
              <Input
                value={color}
                onChange={(e) => { setColor(e.target.value); setDirty(true); }}
                placeholder={DEFAULT_BRAND_FALLBACK}
              />
            </Field>
          </div>
        </Card>

        {/* ── Font ── */}
        <Card className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Type size={15} /> Police des documents
          </h2>

          <Field label="Police">
            <Select
              className="w-full"
              value={brand.fontMode}
              onChange={(e) => patch({ fontMode: e.target.value as FontMode })}
            >
              <option value="inter">Inter (fournie avec l'application)</option>
              <option value="custom">Fichiers de police (.ttf, .otf, .woff2)</option>
              <option value="system">Police installée sur ce poste</option>
            </Select>
          </Field>

          {brand.fontMode === "custom" && (
            <div className="space-y-2">
              {brand.fontFaces.length > 0 && (
                <div className="divide-y rounded-md border text-sm">
                  {brand.fontFaces.map((face, i) => (
                    <div key={`${face.name}-${i}`} className="flex items-center gap-2 p-2">
                      <span className="flex-1 truncate" title={face.name}>{face.name}</span>
                      <Select
                        value={String(face.weight)}
                        onChange={(e) =>
                          patch({
                            fontFaces: brand.fontFaces.map((x, j) =>
                              j === i ? { ...x, weight: Number(e.target.value) } : x,
                            ),
                          })
                        }
                        className="h-8"
                      >
                        <option value="300">Fin</option>
                        <option value="400">Normal</option>
                        <option value="700">Gras</option>
                        <option value="900">Très gras (logo)</option>
                      </Select>
                      <Button
                        variant="ghost"
                        className="h-8 px-2 text-destructive"
                        onClick={() =>
                          patch({ fontFaces: brand.fontFaces.filter((_, j) => j !== i) })
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {brand.fontFaces.length < BRAND_LIMITS.maxFontFaces && (
                <Button variant="outline" onClick={() => void pickFont()}>
                  <Upload size={16} /> Ajouter des fichiers de police…
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Les fichiers sont enregistrés dans la base : le PDF s'imprime à l'identique
                sur n'importe quel poste, même hors ligne. Prévoir le <strong>normal</strong>,
                le <strong>gras</strong> et, si le logo est en texte, le{" "}
                <strong>très gras</strong> — une graisse absente est simulée par le moteur de
                rendu, en moins net. {BRAND_LIMITS.fontFileBytes / 1024 / 1024} Mo par fichier
                au maximum.
              </p>
            </div>
          )}

          {brand.fontMode === "system" && (
            <div className="space-y-2">
              <Field label="Nom de la police">
                <Input
                  value={brand.fontFamily}
                  onChange={(e) => patch({ fontFamily: e.target.value })}
                  placeholder="Poppins, Montserrat, Calibri…"
                />
              </Field>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Le nom doit être exactement celui de la police installée sur Windows. Elle
                n'est pas embarquée : sur un poste où elle manque, le document retombe sur
                Inter sans prévenir. Pour un rendu garanti, préférer les fichiers de police.
              </p>
            </div>
          )}

          {brand.fontMode === "inter" && (
            <p className="text-xs text-muted-foreground">
              Inter est embarquée dans l'application : rendu identique partout, hors ligne.
              C'est la police du gabarit QWASAR.
            </p>
          )}
        </Card>

        {/* ── Pattern ── */}
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Motif du bord droit</h2>
          <p className="text-xs text-muted-foreground">
            La bande de caractères semi-transparents qui longe le bord droit de chaque page —
            les « Q » chez QWASAR.
          </p>

          <Field label="Motif">
            <Select
              className="w-full"
              value={brand.patternMode}
              onChange={(e) => patch({ patternMode: e.target.value as PatternMode })}
            >
              <option value="letters">Caractères répétés</option>
              <option value="none">Aucun motif</option>
            </Select>
          </Field>

          {brand.patternMode === "letters" && (
            <>
              <Field label={`Caractère (${BRAND_LIMITS.patternTextMaxLength} maximum)`}>
                <Input
                  value={brand.patternText}
                  maxLength={BRAND_LIMITS.patternTextMaxLength}
                  onChange={(e) => patch({ patternText: e.target.value })}
                  className="w-24"
                  placeholder="Q"
                />
              </Field>
              <Field label="Nombre de colonnes">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => patch({ patternColumns: n })}
                      className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                        brand.patternColumns === n
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
              <p className="text-xs text-muted-foreground">
                QWASAR en utilise 3. La colonne de texte est calée juste à gauche de la
                bande : ajouter une colonne rétrécit le texte d'autant, en retirer une lui
                rend la place. Marges, en-tête et QR-facture suivent automatiquement.
              </p>
              <Field label={`Taille : ${dmmToMm(brand.patternSizeDmm).toFixed(1)} mm`}>
                <input
                  type="range"
                  min={BRAND_LIMITS.patternSizeDmm.min}
                  max={BRAND_LIMITS.patternSizeDmm.max}
                  value={brand.patternSizeDmm}
                  onChange={(e) => patch({ patternSizeDmm: Number(e.target.value) })}
                  className="w-full"
                />
              </Field>
              <Field label={`Opacité : ${brand.patternOpacityPct} %`}>
                <input
                  type="range"
                  min={BRAND_LIMITS.patternOpacityPct.min}
                  max={BRAND_LIMITS.patternOpacityPct.max}
                  value={brand.patternOpacityPct}
                  onChange={(e) => patch({ patternOpacityPct: Number(e.target.value) })}
                  className="w-full"
                />
              </Field>
            </>
          )}
        </Card>

        {/* ── Preview + options ── */}
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Aperçu de l'en-tête</h2>
          <BrandPreview brand={brand} color={color} logoText={effectiveLogoText} email={active.email} />

          <h2 className="pt-2 text-sm font-semibold">Options</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={brand.showQuoteSignatures}
              onChange={(e) => patch({ showQuoteSignatures: e.target.checked })}
            />
            Blocs de signature au bas des devis
          </label>
          <p className="text-xs text-muted-foreground">
            Les contrats gardent toujours les leurs : un contrat non signé n'engage personne.
          </p>
        </Card>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {dirty && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Modifications non enregistrées. L'aperçu les prend en compte ; les documents, non.
        </p>
      )}
    </div>
  );
}

const DEFAULT_BRAND_FALLBACK = "#3b82f6";

/**
 * Approximate on-screen render of the header: enough to judge at a glance
 * without opening a PDF. The proportions follow the document (1 mm ≈ 3.78 px),
 * but only the PDF preview is authoritative.
 */
function BrandPreview({ brand, color, logoText, email }: {
  brand: BrandSettings;
  color: string;
  logoText: string;
  email: string | null;
}) {
  const brandColor = /^#[0-9a-f]{3,8}$/i.test(color) ? color : DEFAULT_BRAND_FALLBACK;
  const mmToPx = (mm: number) => mm * 3.78;

  return (
    <div className="relative overflow-hidden rounded-md border bg-white p-4 text-black">
      {brand.logoMode === "image" && brand.logoImage ? (
        <img
          src={brand.logoImage}
          alt=""
          style={{ height: mmToPx(dmmToMm(brand.logoHeightDmm)) }}
          className="object-contain"
        />
      ) : brand.logoMode === "none" ? (
        <div className="text-xs italic text-neutral-400">(aucun logo)</div>
      ) : (
        <div
          style={{
            color: brandColor,
            fontWeight: 900,
            fontSize: mmToPx(dmmToMm(brand.logoHeightDmm)),
            lineHeight: 1,
            textTransform: "uppercase",
            letterSpacing: ".02em",
          }}
        >
          {logoText}
        </div>
      )}
      {brand.showContact && email && (
        <div style={{ color: brandColor, fontSize: mmToPx(3.4), marginTop: mmToPx(1.8) }}>
          {email}
        </div>
      )}

      {brand.patternMode === "letters" && (
        <div
          aria-hidden
          className="absolute right-0 top-0 grid h-full overflow-hidden"
          style={{
            // 4.33 mm per column, as on the document.
            width: mmToPx(brand.patternColumns * 4.3333),
            gridTemplateColumns: `repeat(${brand.patternColumns}, 1fr)`,
            opacity: brand.patternOpacityPct / 100,
          }}
        >
          {Array.from({ length: brand.patternColumns * 20 }, (_, i) => (
            <span
              key={i}
              style={{
                color: brandColor,
                fontWeight: 900,
                fontSize: mmToPx(dmmToMm(brand.patternSizeDmm)),
                lineHeight: `${mmToPx(dmmToMm(brand.patternSizeDmm) * 1.214)}px`,
                textAlign: "center",
              }}
            >
              {brand.patternText}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
