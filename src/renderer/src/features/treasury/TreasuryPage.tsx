/**
 * Cash position page: tracking of available funds + reconciliation (realigning on
 * the actual balance). Moved out of the dashboard, which stays dedicated to display.
 * Reuses the `CashView` view (KPIs, receivables ageing, reconciliations) fed by it.
 */

import { useCallback, useEffect, useState } from "react";
import type { CompanyDashboardResult } from "@shared/dashboard.js";
import type { ObjectiveProgress } from "@shared/objectives.js";
import { useCompany } from "../../app/CompanyContext.js";
import { CashView } from "./CashView.js";
import { YearStepper } from "../../components/YearStepper.js";

const CURRENT_YEAR = new Date().getFullYear();

export function TreasuryPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const [year, setYear] = useState(CURRENT_YEAR);
  const [data, setData] = useState<CompanyDashboardResult | null>(null);
  const [objectives, setObjectives] = useState<ObjectiveProgress[]>([]);

  const load = useCallback(async () => {
    if (!companyId) return;
    const [d, o] = await Promise.all([
      window.api.invoke("dashboard:company", { companyId, year }),
      window.api.invoke("dashboard:objectives", { companyId }),
    ]);
    setData(d);
    setObjectives(o);
  }, [companyId, year]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return <p className="text-sm text-muted-foreground">Aucune société.</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trésorerie</h1>
          <p className="text-sm text-muted-foreground">{active.name}</p>
        </div>
        <YearStepper year={year} onChange={setYear} />
      </div>
      {data ? (
        <CashView data={data} objectives={objectives} companyId={companyId} reload={load} />
      ) : (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      )}
    </div>
  );
}
