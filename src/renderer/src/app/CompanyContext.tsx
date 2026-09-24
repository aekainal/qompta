/**
 * Context of the active company. Loads the list of companies, persists the selection
 * via app:setActiveCompany, and exposes it back to the whole application.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Company } from "@shared/types.js";

interface CompanyContextValue {
  companies: Company[];
  active: Company | null;
  loading: boolean;
  setActive: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [active, setActiveState] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.api.invoke("companies:list", {});
      setCompanies(list);
      const activeId = await window.api.invoke("app:getActiveCompany", undefined as never);
      const found = list.find((c) => c.id === activeId) ?? list[0] ?? null;
      setActiveState(found);
    } catch (e) {
      // NEVER stay stuck on "Chargement…": we log and release the UI.
      console.error("Échec du chargement des sociétés", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const setActive = useCallback(
    async (id: string) => {
      await window.api.invoke("app:setActiveCompany", { companyId: id });
      const list = await window.api.invoke("companies:list", {});
      setCompanies(list);
      setActiveState(list.find((c) => c.id === id) ?? null);
    },
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Ctx.Provider value={{ companies, active, loading, setActive, reload }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCompany(): CompanyContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCompany doit être utilisé dans CompanyProvider");
  return v;
}
