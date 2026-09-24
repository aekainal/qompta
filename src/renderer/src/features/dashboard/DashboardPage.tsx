/**
 * Customizable dashboards: several dashboards (tabs), each made of widgets
 * (KPI or chart) laid out on a FREE grid, home-made (pointer events): in
 * « Modifier » mode, dotted grid background, each widget moves anywhere and
 * resizes freely (handle at the bottom right), without forced collisions.
 * The rendering of each widget adapts to its size (widgets.tsx).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Check, LineChart as LineChartIcon, List, Pencil, PieChart as PieChartIcon, Plus, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CompanyDashboardResult } from "@shared/dashboard.js";
import type { ObjectiveCategory, ObjectiveMetric } from "@shared/objectives.js";
import { CATEGORY_LABELS, METRIC_CATALOG } from "@shared/objectives.js";
import type { CustomChartType, CustomDim, Dashboard, DashboardTemplate, DashboardWidget } from "@shared/dashboards.js";
import { CHART_CATALOG, chartDef, CUSTOM_DIMS, CUSTOM_TYPES, DASHBOARD_TEMPLATES, GRID_COLS, normalizeWidgets, widgetMin, widgetsOverlap } from "@shared/dashboards.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { Button, Card, Modal } from "../../components/ui/primitives.js";
import { YearStepper } from "../../components/YearStepper.js";
import { formatMetricValue } from "./parts.js";
import { cn } from "../../lib/utils.js";
import { WidgetRenderer } from "./widgets.js";

const CURRENT_YEAR = new Date().getFullYear();
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ObjectiveCategory[];
const ROW_H = 32; // height of a grid row, in px
const GAP = 8; // space between widgets, in px

const TYPE_ICONS: Record<CustomChartType, LucideIcon> = { bar: BarChart3, line: LineChartIcon, pie: PieChartIcon };
const CHART_ICONS: Record<string, LucideIcon> = {
  monthly_products_charges: BarChart3, monthly_pcr: BarChart3, aging: BarChart3, quotes_pipeline: BarChart3, top_clients: BarChart3,
  result_cumulative: LineChartIcon, revenue_yoy: LineChartIcon, metric_monthly: LineChartIcon, clients_cumulative: LineChartIcon,
  products_by_cat: PieChartIcon, expenses_by_cat: PieChartIcon, revenue_by_client: PieChartIcon,
  collected_vs_invoiced: BarChart3, result_waterfall: BarChart3,
  unpaid_list: List, overdue_list: List,
};

type Draft = { id: string; x: number; y: number; w: number; h: number };

export function DashboardPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const actionBar = useActionBar();

  const [year, setYear] = useState(CURRENT_YEAR);
  const [boards, setBoards] = useState<Dashboard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [data, setData] = useState<CompanyDashboardResult | null>(null);
  const [edit, setEdit] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setGridW(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadBoards = useCallback(async () => {
    if (!companyId) return;
    const list = await window.api.invoke("dashboards:list", { companyId });
    setBoards(list.map((b) => ({ ...b, widgets: normalizeWidgets(b.widgets) })));
    setActiveId((cur) => (cur && list.some((b) => b.id === cur) ? cur : list[0]?.id ?? null));
  }, [companyId]);
  useEffect(() => { void loadBoards(); }, [loadBoards]);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setData(await window.api.invoke("dashboard:company", { companyId, year }));
  }, [companyId, year]);
  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => { setEdit(false); }, [companyId]);

  if (!active) return <p className="text-sm text-muted-foreground">Aucune société.</p>;

  const current = boards.find((b) => b.id === activeId) ?? null;
  const colW = gridW > 0 ? gridW / GRID_COLS : 0;

  async function saveWidgets(widgets: DashboardWidget[]) {
    if (!current) return;
    setBoards((bs) => bs.map((b) => (b.id === current.id ? { ...b, widgets } : b)));
    await window.api.invoke("dashboards:update", { companyId, id: current.id, data: { widgets } });
  }

  function addWidget(partial: Omit<DashboardWidget, "id" | "x" | "y">) {
    if (!current) return;
    setPickerOpen(false);
    const y = current.widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    void saveWidgets([...current.widgets, { ...partial, id: crypto.randomUUID(), x: 0, y }]);
  }
  function removeWidget(id: string) {
    if (!current) return;
    const before = current.widgets;
    void saveWidgets(before.filter((w) => w.id !== id));
    actionBar.undoable("Widget retiré", () => saveWidgets(before));
  }

  /** Starts a move or a resize with the mouse (edit mode). */
  function beginGesture(e: React.PointerEvent, wdg: DashboardWidget, mode: "move" | "resize") {
    if (!edit || !current || colW <= 0) return;
    e.preventDefault();
    if (mode === "resize") e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const { x: ox, y: oy, w: ow, h: oh } = wdg;
    const min = widgetMin(wdg);
    const base = current.widgets;
    let last = { x: ox, y: oy, w: ow, h: oh };
    const compute = (ev: PointerEvent): Draft => {
      const dxC = Math.round((ev.clientX - startX) / colW);
      const dyC = Math.round((ev.clientY - startY) / ROW_H);
      if (mode === "move") {
        return { id: wdg.id, x: Math.max(0, Math.min(GRID_COLS - ow, ox + dxC)), y: Math.max(0, oy + dyC), w: ow, h: oh };
      }
      return { id: wdg.id, x: ox, y: oy, w: Math.max(min.minW, Math.min(GRID_COLS - ox, ow + dxC)), h: Math.max(min.minH, oh + dyC) };
    };
    const others = base.filter((g) => g.id !== wdg.id);
    const onMove = (ev: PointerEvent) => {
      const d = compute(ev);
      // Collisions: we only move/resize onto free space.
      if (others.some((g) => widgetsOverlap(d, g))) return;
      last = { x: d.x, y: d.y, w: d.w, h: d.h };
      setDraft(d);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraft(null);
      void saveWidgets(base.map((g) => (g.id === wdg.id ? { ...g, ...last } : g)));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    setDraft({ id: wdg.id, ...last });
  }

  async function addBoard(template: DashboardTemplate | null) {
    setBoardPickerOpen(false);
    const widgets = template ? template.widgets.map((w) => ({ ...w, id: crypto.randomUUID() })) : [];
    const name = template ? template.name : "Nouveau tableau";
    const created = await window.api.invoke("dashboards:create", { companyId, data: { name, position: boards.length, widgets } });
    await loadBoards();
    setActiveId(created.id);
    setEdit(!template); // a template is ready to use; a blank board opens in edit mode
  }
  async function renameBoard(name: string) {
    if (!current || !name.trim() || name === current.name) return;
    setBoards((bs) => bs.map((b) => (b.id === current.id ? { ...b, name } : b)));
    const id = current.id;
    await actionBar.track(
      `Tableau renommé « ${name} »`,
      () => window.api.invoke("dashboards:update", { companyId, id, data: { name } }),
      loadBoards,
    );
  }
  function deleteBoard() {
    if (!current || boards.length <= 1) return;
    const id = current.id;
    actionBar.defer(`Suppression du tableau « ${current.name} »`, async () => {
      await window.api.invoke("dashboards:remove", { companyId, id });
      await loadBoards();
    });
  }

  const widgets = current?.widgets ?? [];
  const effOf = (w: DashboardWidget) => (draft && draft.id === w.id ? draft : w);
  const contentH = widgets.reduce((m, w) => Math.max(m, (effOf(w).y + effOf(w).h) * ROW_H), 0) + (edit ? 4 * ROW_H : 0);
  const dotStyle = edit && colW > 0
    ? { backgroundImage: "radial-gradient(circle, rgba(130,130,150,0.4) 1px, transparent 1px)", backgroundSize: `${colW}px ${ROW_H}px` }
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">{active.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <YearStepper year={year} onChange={setYear} />
          <Button variant={edit ? "default" : "outline"} className="h-9" onClick={() => setEdit((e) => !e)}>
            {edit ? <><Check size={15} /> Terminer</> : <><Pencil size={15} /> Modifier</>}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border p-1">
        {boards.map((b) => (
          <button key={b.id} onClick={() => setActiveId(b.id)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", b.id === activeId ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {b.name}
          </button>
        ))}
        <button onClick={() => setBoardPickerOpen(true)} title="Nouveau tableau de bord" className="rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent">
          <Plus size={16} />
        </button>
      </div>

      {edit && current && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2">
          <input key={current.id} defaultValue={current.name} onBlur={(e) => void renameBoard(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm" aria-label="Nom du tableau" />
          <Button variant="outline" className="h-8" onClick={() => setPickerOpen(true)}><Plus size={15} /> Ajouter un widget</Button>
          <Button variant="ghost" className="h-8 text-destructive disabled:opacity-40" disabled={boards.length <= 1} onClick={deleteBoard}>
            <Trash2 size={15} /> Supprimer ce tableau
          </Button>
          <span className="text-xs text-muted-foreground">Glissez un widget pour le déplacer, la poignée en bas à droite pour le redimensionner.</span>
        </div>
      )}

      <div ref={wrapRef} className="w-full">
        {!data || !current ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : widgets.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <p className="text-foreground">Tableau vide.</p>
            <p className="mt-1 text-sm">Passez en « Modifier » puis « Ajouter un widget ».</p>
          </Card>
        ) : (
          <div className={cn("relative", edit && "select-none")} style={{ height: contentH, ...dotStyle }}>
            {widgets.map((w) => {
              const e = effOf(w);
              return (
                <div
                  key={w.id}
                  className={cn("absolute", edit && "cursor-move")}
                  style={{ left: e.x * colW, top: e.y * ROW_H, width: e.w * colW, height: e.h * ROW_H, padding: GAP / 2 }}
                  onPointerDown={edit ? (ev) => beginGesture(ev, w, "move") : undefined}
                >
                  <div className={cn("group relative h-full w-full", edit && "rounded-lg ring-1 ring-dashed ring-border")}>
                    {edit && (
                      <div className="absolute right-1.5 top-1.5 z-30 flex items-center gap-1 rounded-md border bg-card/90 px-1 py-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:opacity-100" onPointerDown={(ev) => ev.stopPropagation()}>
                        <button className="rounded px-0.5 text-destructive hover:bg-accent" title="Retirer" onClick={() => removeWidget(w.id)}><X size={14} /></button>
                      </div>
                    )}
                    <WidgetRenderer widget={w} data={data} />
                    {edit && (
                      <div
                        title="Redimensionner"
                        onPointerDown={(ev) => beginGesture(ev, w, "resize")}
                        className="absolute bottom-0.5 right-0.5 z-30 h-4 w-4 cursor-se-resize rounded-br-md border-b-2 border-r-2 border-primary/70"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Ajouter un widget" wide>
        {data && <WidgetPicker data={data} onAdd={addWidget} />}
      </Modal>

      <Modal open={boardPickerOpen} onClose={() => setBoardPickerOpen(false)} title="Nouveau tableau de bord">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Partez d'un modèle prêt à l'emploi (garni de KPIs et graphes) ou d'une page vierge.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DASHBOARD_TEMPLATES.map((t) => (
              <PickCard key={t.name} title={t.name} subtitle={`${t.widgets.length} widgets`} onClick={() => void addBoard(t)} />
            ))}
            <PickCard title="Tableau vierge" subtitle="À composer soi-même" onClick={() => void addBoard(null)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Widget picker as cards ──

function PickCard({ title, subtitle, icon: Icon, active, onClick }: { title: string; subtitle?: string; icon?: LucideIcon; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-accent", active && "border-primary bg-primary/10")}
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon size={16} className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")} />}
        <span className="text-sm font-medium">{title}</span>
      </span>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </button>
  );
}

type PickTab = "kpi" | "chart" | "custom";

function WidgetPicker({ data, onAdd }: { data: CompanyDashboardResult; onAdd: (w: Omit<DashboardWidget, "id" | "x" | "y">) => void }) {
  const [tab, setTab] = useState<PickTab>("kpi");
  const [type, setType] = useState<CustomChartType>("bar");
  const [dim, setDim] = useState<CustomDim>("month");
  const [metric, setMetric] = useState<ObjectiveMetric>(METRIC_CATALOG[0].key);
  const dimNeedsMetric = CUSTOM_DIMS.find((d) => d.dim === dim)?.needsMetric ?? false;

  const tabs: { id: PickTab; label: string }[] = [
    { id: "kpi", label: "KPI" },
    { id: "chart", label: "Graphes prêts" },
    { id: "custom", label: "Graphe personnalisé" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "kpi" && (
        <div className="max-h-[55vh] space-y-3 overflow-auto pr-1">
          {CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">{CATEGORY_LABELS[cat]}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {METRIC_CATALOG.filter((m) => m.category === cat).map((m) => (
                  <PickCard key={m.key} title={m.label} subtitle={formatMetricValue(m.unit, data.metrics[m.key])} onClick={() => onAdd({ kind: "kpi", metric: m.key, chart: null, custom: null, w: 3, h: 2 })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "chart" && (
        <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-auto pr-1 sm:grid-cols-3">
          {CHART_CATALOG.filter((c) => !c.needsMetric).map((c) => (
            <PickCard key={c.kind} icon={CHART_ICONS[c.kind]} title={c.label} onClick={() => { const d = chartDef(c.kind); onAdd({ kind: "chart", chart: c.kind, metric: null, custom: null, w: d.w, h: d.h }); }} />
          ))}
        </div>
      )}

      {tab === "custom" && (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Type de graphe</div>
            <div className="grid grid-cols-3 gap-2">
              {CUSTOM_TYPES.map((t) => <PickCard key={t.type} icon={TYPE_ICONS[t.type]} title={t.label} active={type === t.type} onClick={() => setType(t.type)} />)}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Dimension (axe)</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CUSTOM_DIMS.map((d) => <PickCard key={d.dim} title={d.label} active={dim === d.dim} onClick={() => setDim(d.dim)} />)}
            </div>
          </div>
          {dimNeedsMetric && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Valeur (métrique)</div>
              <div className="grid max-h-52 grid-cols-2 gap-2 overflow-auto pr-1 sm:grid-cols-3">
                {METRIC_CATALOG.map((m) => <PickCard key={m.key} title={m.label} active={metric === m.key} onClick={() => setMetric(m.key)} />)}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => onAdd({ kind: "chart", chart: "custom", metric: null, custom: { type, dim, metric: dimNeedsMetric ? metric : null }, w: 6, h: 6 })}>Ajouter ce graphe</Button>
          </div>
        </div>
      )}
    </div>
  );
}
