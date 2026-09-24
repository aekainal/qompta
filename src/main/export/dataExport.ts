/**
 * Excel export of a company's data (invoices + third parties).
 */

import { dialog } from "electron";
import * as XLSX from "xlsx";
import type { Invoice, ThirdParty } from "../../shared/types.js";

function chf(cents: number): number {
  return cents / 100;
}

export async function exportCompanyExcel(args: {
  companyName: string;
  invoices: Invoice[];
  thirdParties: ThirdParty[];
}): Promise<{ saved: boolean; path?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Exporter les données (Excel)",
    defaultPath: `qompta-${args.companyName.replace(/\s+/g, "-")}.xlsx`,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (canceled || !filePath) return { saved: false };

  const tpName = new Map(args.thirdParties.map((t) => [t.id, t.name]));

  const invRows = args.invoices.map((i) => ({
    Date: i.issueDate,
    Échéance: i.dueDate ?? "",
    Type: i.type === "sale" ? "Vente" : "Achat",
    Numéro: i.number ?? "",
    Tiers: i.thirdPartyId ? tpName.get(i.thirdPartyId) ?? "" : "",
    Description: i.description ?? "",
    "Code TVA": i.vatCode ?? "",
    HT: chf(i.amountHt),
    TVA: chf(i.vatAmount),
    TTC: chf(i.amountTtc),
    Statut: i.status,
  }));
  const tpRows = args.thirdParties.map((t) => ({
    Nom: t.name,
    Type: t.kind,
    Email: t.email ?? "",
    "N° TVA": t.vatNumber ?? "",
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), "Factures");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tpRows), "Tiers");
  XLSX.writeFile(wb, filePath);
  return { saved: true, path: filePath };
}
