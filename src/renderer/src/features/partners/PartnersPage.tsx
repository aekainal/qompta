/**
 * Partners: the corporate customers bound by a contract.
 *
 * The list is not entered but derived (see src/shared/partners.ts): every
 * customer of «entreprise» kind with at least one contract appears here. It
 * shows what makes the relationship: the monthly recurring amount, the
 * commitment, what has been invoiced, what is still due.
 */

import { useCallback, useEffect, useState } from "react";
import { Building2, CalendarClock, FileSignature } from "lucide-react";
import type { Partner, PartnersSummary } from "@shared/partners.js";
import { useCompany } from "../../app/CompanyContext.js";
import { Badge, Card } from "../../components/ui/primitives.js";
import { formatChf, formatDate } from "../../lib/format.js";

const CONTRACT_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  signed: "Signé",
  terminated: "Résilié",
};

export function PartnersPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const [partners, setPartners] = useState<Partner[]>([]);
  const [summary, setSummary] = useState<PartnersSummary | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    const res = await window.api.invoke("partners:list", { companyId });
    setPartners(res.partners);
    setSummary(res.summary);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Partenaires</h1>
        <p className="text-sm text-muted-foreground">
          Clients entreprises sous contrat · {active.name}
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label="Partenaires"
            value={String(summary.count)}
            hint={`${summary.activeCount} sous contrat signé`}
            accent="blue"
          />
          <Kpi
            label="Récurrent mensuel"
            value={formatChf(summary.monthlyRecurringHt)}
            hint="HT, contrats signés"
            accent="green"
          />
          <Kpi
            label="Récurrent annualisé"
            value={formatChf(summary.yearlyRecurringHt)}
            hint="le socle sur douze mois"
          />
          <Kpi
            label="Reste dû"
            value={formatChf(summary.outstandingTtc)}
            hint={`${formatChf(summary.invoicedHt)} facturés au total`}
            accent={summary.outstandingTtc > 0 ? "amber" : undefined}
          />
        </div>
      )}

      <Card className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
        <Building2 size={16} className="mt-0.5 shrink-0" />
        <span>
          Cette liste se déduit du carnet d'adresses : y figure tout client de nature
          <strong> entreprise</strong> ayant au moins un contrat. Rien à cocher : un contrat
          ajouté ou supprimé fait entrer ou sortir le tiers d'ici tout seul. La nature se
          règle sur la fiche du client.
        </span>
      </Card>

      {partners.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Aucun partenaire. Il en apparaîtra dès qu'un client de nature « entreprise » aura
          un contrat.
        </Card>
      ) : (
        <div className="space-y-3">
          {partners.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{p.name}</span>
                    {p.activeContracts > 0 ? (
                      <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">
                        {p.activeContracts} contrat{p.activeContracts > 1 ? "s" : ""} signé
                        {p.activeContracts > 1 ? "s" : ""}
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        Aucun contrat signé
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[p.city, p.email].filter(Boolean).join(" · ") || "-"}
                  </div>
                </div>
                <div className="flex gap-6 text-right">
                  <Figure label="Récurrent / mois" value={formatChf(p.monthlyRecurringHt)} strong />
                  <Figure label="Facturé (HT)" value={formatChf(p.invoicedHt)} />
                  <Figure
                    label="Reste dû"
                    value={formatChf(p.outstandingTtc)}
                    warn={p.outstandingTtc > 0}
                  />
                </div>
              </div>

              <div className="mt-3 divide-y border-t pt-2 text-sm">
                {p.contracts.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <FileSignature size={14} className="text-muted-foreground" />
                      <span className="font-medium">{c.number}</span>
                      <span className="text-muted-foreground">{c.title ?? "-"}</span>
                      <Badge>{CONTRACT_LABELS[c.status] ?? c.status}</Badge>
                    </span>
                    <span className="flex items-center gap-4 text-xs text-muted-foreground">
                      {c.minDurationMonths ? (
                        <span className="flex items-center gap-1">
                          <CalendarClock size={13} />
                          {c.minDurationMonths} mois d'engagement
                        </span>
                      ) : null}
                      {c.startDate && <span>dès le {formatDate(c.startDate)}</span>}
                      {c.monthlyAmountHt ? (
                        <span className="tabular-nums">{formatChf(c.monthlyAmountHt)} / mois</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>

              {p.lastInvoiceDate && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Dernière facture le {formatDate(p.lastInvoiceDate)}
                  {p.collectedHt > 0 && ` · ${formatChf(p.collectedHt)} encaissés`}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, accent }: {
  label: string;
  value: string;
  hint?: string;
  accent?: "green" | "blue" | "amber";
}) {
  const color =
    accent === "green" ? "text-green-600 dark:text-green-400"
    : accent === "amber" ? "text-amber-600 dark:text-amber-400"
    : accent === "blue" ? "text-primary"
    : "";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function Figure({ label, value, strong, warn }: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`tabular-nums ${strong ? "text-base font-semibold" : "text-sm"} ${
          warn ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
