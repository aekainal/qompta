/**
 * Application shell: side navigation + header with the company switcher.
 * M1 exposes Dashboard (placeholder) and Companies. The other modules arrive in
 * the following batches.
 */

import { useEffect, useState } from "react";
import appIcon from "@resources/icon.png";
import {
  Building2,
  BookOpen,
  ChevronDown,
  Coins,
  Handshake,
  FileSignature,
  FileText,
  LayoutDashboard,
  Moon,
  Palette,
  PenLine,
  PiggyBank,
  Receipt,
  ScrollText,
  Settings,
  Sun,
  Target,
  Truck,
  Users,
} from "lucide-react";
import { useCompany } from "./app/CompanyContext.js";
import { useTheme } from "./app/ThemeContext.js";
import { CompanySwitcher } from "./components/CompanySwitcher.js";
import { WindowControls } from "./components/WindowControls.js";
import { Button, Card } from "./components/ui/primitives.js";
import { CompaniesPage } from "./features/companies/CompaniesPage.js";
import { InvoicesPage } from "./features/invoices/InvoicesPage.js";
import { QuotesPage } from "./features/quotes/QuotesPage.js";
import { ContractsPage } from "./features/contracts/ContractsPage.js";
import { ClientsPage, SuppliersPage } from "./features/thirdparties/ThirdPartiesPage.js";
import { PartnersPage } from "./features/partners/PartnersPage.js";
import { AccountsPage } from "./features/accounts/AccountsPage.js";
import { VatReturnPage } from "./features/vat/VatReturnPage.js";
import { DashboardPage } from "./features/dashboard/DashboardPage.js";
import { TreasuryPage } from "./features/treasury/TreasuryPage.js";
import { ObjectivesPage } from "./features/objectives/ObjectivesPage.js";
import { TaxPage } from "./features/tax/TaxPage.js";
import { AssociatesPage } from "./features/associates/AssociatesPage.js";
import { FundingPage } from "./features/funding/FundingPage.js";
import { SignaturesPage } from "./features/signatures/SignaturesPage.js";
import { BrandPage } from "./features/brand/BrandPage.js";
import { SettingsPage } from "./features/settings/SettingsPage.js";
import { cn } from "./lib/utils.js";

type Route =
  | "dashboard"
  | "treasury"
  | "objectives"
  | "quotes"
  | "invoices"
  | "contracts"
  | "vat"
  | "tax"
  | "associates"
  | "funding"
  | "signatures"
  | "partners"
  | "clients"
  | "suppliers"
  | "accounts"
  | "brand"
  | "settings"
  | "companies";

type NavItem = { route: Route; label: string; icon: typeof LayoutDashboard };

/** Menus grouped into collapsible sections (accordion): too many flat entries. */
const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Pilotage",
    items: [
      { route: "treasury", label: "Trésorerie", icon: Coins },
      { route: "objectives", label: "Objectifs", icon: Target },
    ],
  },
  {
    title: "Ventes",
    items: [
      { route: "quotes", label: "Devis", icon: ScrollText },
      { route: "invoices", label: "Factures", icon: FileText },
      { route: "contracts", label: "Contrats", icon: FileSignature },
    ],
  },
  {
    title: "TVA & impôts",
    items: [
      { route: "vat", label: "Décompte TVA", icon: Receipt },
      { route: "tax", label: "Impôts", icon: FileText },
      { route: "accounts", label: "Plan comptable", icon: BookOpen },
    ],
  },
  {
    title: "Associés & fonds",
    items: [
      { route: "associates", label: "Associés", icon: Users },
      { route: "funding", label: "Entrées de fonds", icon: PiggyBank },
      { route: "signatures", label: "Signatures", icon: PenLine },
    ],
  },
  {
    title: "Carnet d'adresses",
    items: [
      { route: "partners", label: "Partenaires", icon: Handshake },
      { route: "clients", label: "Clients", icon: Users },
      { route: "suppliers", label: "Fournisseurs", icon: Truck },
    ],
  },
  {
    title: "Configuration",
    items: [
      { route: "brand", label: "Apparence PDF", icon: Palette },
      { route: "companies", label: "Sociétés", icon: Building2 },
      { route: "settings", label: "Réglages", icon: Settings },
    ],
  },
];

/** Dashboard: pinned at the very top, outside the collapsible sections. */
const TOP_ITEMS: NavItem[] = [
  { route: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
];
const NAV: NavItem[] = [...TOP_ITEMS, ...SECTIONS.flatMap((s) => s.items)];

/** Title of the section holding a route (to open the right one on start / navigation). */
function sectionOf(route: Route): string {
  return SECTIONS.find((s) => s.items.some((it) => it.route === route))?.title ?? "";
}

function Placeholder({ title }: { title: string }) {
  return (
    <Card className="p-8 text-center text-muted-foreground">
      <p className="text-lg font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm">Ce module sera disponible dans un prochain lot.</p>
    </Card>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>("dashboard");
  // Collapsed/expanded sections: at first only the current screen's one is open.
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  const { active, loading } = useCompany();
  const { theme, toggle } = useTheme();

  // Navigating to a screen always opens its section (it holds the active item).
  useEffect(() => {
    setOpenSections((prev) => (prev.has(sectionOf(route)) ? prev : new Set(prev).add(sectionOf(route))));
  }, [route]);

  function toggleSection(title: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 flex-col border-r bg-card">
        <div className="app-drag flex items-center gap-2 px-5 py-4 text-xl font-bold">
          <img src={appIcon} alt="" className="h-8 w-8" />
          Qompta
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {TOP_ITEMS.map(({ route: r, label, icon: Icon }) => (
            <button
              key={r}
              onClick={() => setRoute(r)}
              className={cn(
                "mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                route === r ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          {SECTIONS.map((section) => {
            const isOpen = openSections.has(section.title);
            const hasActive = section.items.some((it) => it.route === route);
            return (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(section.title)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    {section.title}
                    {!isOpen && hasActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </span>
                  <ChevronDown size={14} className={cn("transition-transform", isOpen ? "" : "-rotate-90")} />
                </button>
                {isOpen && (
                  <div className="mb-1 mt-0.5 space-y-0.5 border-l pl-2">
                    {section.items.map(({ route: r, label, icon: Icon }) => (
                      <button
                        key={r}
                        onClick={() => setRoute(r)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          route === r ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                        )}
                      >
                        <Icon size={18} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="p-3 text-xs text-muted-foreground">v{__APP_VERSION__}</div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="app-drag flex items-center justify-between border-b bg-card pl-6"
          onDoubleClick={() => void window.api.invoke("window:toggleMaximize", undefined as never)}
        >
          <div className="no-drag flex items-center py-3">
            <CompanySwitcher />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="no-drag" onClick={toggle} aria-label="Basculer le thème">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <WindowControls />
          </div>
        </header>

        <main className={"flex-1 overflow-auto p-6"}>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : route === "companies" ? (
            <CompaniesPage />
          ) : active && route === "dashboard" ? (
            <DashboardPage />
          ) : active && route === "treasury" ? (
            <TreasuryPage />
          ) : active && route === "objectives" ? (
            <ObjectivesPage />
          ) : active && route === "quotes" ? (
            <QuotesPage />
          ) : active && route === "invoices" ? (
            <InvoicesPage />
          ) : active && route === "contracts" ? (
            <ContractsPage />
          ) : active && route === "vat" ? (
            <VatReturnPage />
          ) : active && route === "tax" ? (
            <TaxPage />
          ) : active && route === "associates" ? (
            <AssociatesPage />
          ) : active && route === "funding" ? (
            <FundingPage />
          ) : active && route === "signatures" ? (
            <SignaturesPage />
          ) : active && route === "partners" ? (
            <PartnersPage />
          ) : active && route === "clients" ? (
            <ClientsPage />
          ) : active && route === "suppliers" ? (
            <SuppliersPage />
          ) : active && route === "accounts" ? (
            <AccountsPage />
          ) : active && route === "brand" ? (
            <BrandPage />
          ) : active && route === "settings" ? (
            <SettingsPage />
          ) : !active ? (
            <Card className="p-8 text-center">
              <p className="text-lg font-medium">Bienvenue dans Qompta</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Commencez par créer une société dans l'onglet « Sociétés ».
              </p>
              <Button className="mt-4" onClick={() => setRoute("companies")}>
                Créer une société
              </Button>
            </Card>
          ) : (
            <Placeholder title={NAV.find((n) => n.route === route)?.label ?? ""} />
          )}
        </main>
      </div>
    </div>
  );
}
