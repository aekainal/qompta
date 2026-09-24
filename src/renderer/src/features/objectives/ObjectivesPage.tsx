/**
 * Targets page: managing the company's targets (catalogue + tracking).
 * Moved out of the dashboard, which stays dedicated to visualization.
 */

import { useCompany } from "../../app/CompanyContext.js";
import { ObjectivesView } from "../dashboard/ObjectivesView.js";

export function ObjectivesPage() {
  const { active } = useCompany();
  if (!active) return <p className="text-sm text-muted-foreground">Aucune société.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Objectifs</h1>
        <p className="text-sm text-muted-foreground">{active.name}</p>
      </div>
      <ObjectivesView companyId={active.id} />
    </div>
  );
}
