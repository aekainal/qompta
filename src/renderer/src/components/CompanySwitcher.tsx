/**
 * Company picker (always visible at the top), with a legal-form badge.
 */

import { useCompany } from "../app/CompanyContext.js";
import { LEGAL_FORM_SHORT } from "@shared/legal-form.js";
import { Badge, Select } from "./ui/primitives.js";

export function CompanySwitcher() {
  const { companies, active, setActive } = useCompany();

  if (companies.length === 0) {
    return <span className="text-sm text-muted-foreground">Aucune société</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={active?.id ?? ""}
        onChange={(e) => void setActive(e.target.value)}
        className="min-w-56 font-medium"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {active && (
        <Badge className="bg-primary/15 text-primary">
          {LEGAL_FORM_SHORT[active.legalForm]}
        </Badge>
      )}
    </div>
  );
}
