/**
 * Contract template variables (`{{client}}`, `{{montantMensuel}}`, etc.).
 *
 * The numeric values of a template are variables filled in from the contract and
 * the originating quote, so that a change of price or duration does not force a
 * rewrite of the text.
 *
 * PURE module. When a contract is created, the sections are **resolved then frozen**
 * into `contracts.articles_json`: a signed contract must not change because the
 * template has evolved since. The template catalog lives in `contract-models.ts`.
 */

import { formatChf } from "../money.js";
import { mapBlockText, type ContractBlock } from "./contract-blocks.js";

/** Variables accepted in the body of the articles. */
export interface ContractVariables {
  /** Customer name. */
  client: string;
  /** One-off service lines, net amount in cents (website creation, etc.). */
  oneOffAmountHt: number | null;
  /** Recurring net amount in cents. */
  monthlyAmountHt: number | null;
  /** Minimum commitment duration, in months. */
  minDurationMonths: number | null;
  /** Termination notice, in days. */
  noticeDays: number | null;
  /** Due day of the monthly invoices. */
  dueDayOfMonth: number;
  /** Annual late-payment interest rate, in basis points. */
  lateInterestBps: number;
  /** Canton of jurisdiction. */
  canton: string;
  /** Name of the company issuing the contract. */
  provider: string;
  /** Subject of the contract. */
  subject: string;
  /** Start of the service lines (ISO). */
  startDate: string | null;
}

export const DEFAULT_CONTRACT_VARIABLES: ContractVariables = {
  client: "",
  oneOffAmountHt: null,
  monthlyAmountHt: null,
  minDurationMonths: 18,
  noticeDays: 30,
  dueDayOfMonth: 25,
  lateInterestBps: 500,
  canton: "Berne",
  provider: "",
  subject: "",
  startDate: null,
};

/** Variables offered for insertion in the contract builder. */
export const CONTRACT_VARIABLE_HELP: { key: string; label: string }[] = [
  { key: "client", label: "Nom du client" },
  { key: "prestataire", label: "Votre société" },
  { key: "objet", label: "Objet du contrat" },
  { key: "montantPonctuel", label: "Montant ponctuel HT" },
  { key: "montantMensuel", label: "Montant mensuel HT" },
  { key: "dureeMinimale", label: "Durée minimale" },
  { key: "preavis", label: "Préavis" },
  { key: "dateDebut", label: "Date de début" },
  { key: "jourEcheance", label: "Jour d'échéance" },
  { key: "interetMoratoire", label: "Intérêt moratoire" },
  { key: "canton", label: "Canton du for" },
];

/** Agrees a noun in the plural according to the quantity. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Replacement values, as text ready to print. */
function substitutions(v: ContractVariables): Record<string, string> {
  const oneOff = v.oneOffAmountHt;
  const monthly = v.monthlyAmountHt;
  return {
    client: v.client || "le client",
    montantPonctuel: oneOff != null ? `${formatChf(oneOff)} CHF` : "le montant indiqué au devis",
    montantMensuel:
      monthly != null ? `${formatChf(monthly)} CHF` : "le montant convenu",
    dureeMinimale:
      v.minDurationMonths != null ? plural(v.minDurationMonths, "mois", "mois") : "la durée convenue",
    preavis: v.noticeDays != null ? plural(v.noticeDays, "jour", "jours") : "le préavis convenu",
    jourEcheance: String(v.dueDayOfMonth),
    interetMoratoire: `${(v.lateInterestBps / 100).toFixed(2).replace(/\.?0+$/, "")} %`,
    canton: v.canton,
    prestataire: v.provider || "le prestataire",
    objet: v.subject || "les prestations convenues",
    dateDebut: v.startDate ? v.startDate.slice(0, 10).split("-").reverse().join(".") : "la date convenue",
  };
}

/** Replaces the `{{variables}}` of a text; an unknown variable is left as is. */
export function resolveVariables(text: string, v: ContractVariables): string {
  const map = substitutions(v);
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => map[key] ?? whole);
}

/** Applies the variables to a list of sections. */
export function resolveBlocks(blocks: ContractBlock[], v: ContractVariables): ContractBlock[] {
  return blocks.map((b) => mapBlockText(b, (text) => resolveVariables(text, v)));
}
