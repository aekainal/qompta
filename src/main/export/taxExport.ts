/**
 * Export of the tax file (PDF via printToPDF, Excel via xlsx) on the main side.
 */

import { writeFile } from "node:fs/promises";
import { BrowserWindow, dialog } from "electron";
import * as XLSX from "xlsx";
import { LEGAL_FORM_LABELS } from "../../shared/legal-form.js";
import type { TaxDossier } from "../../shared/tax/dossier.js";

function chf(cents: number): string {
  return (cents / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rows(d: TaxDossier): (string | number)[][] {
  const out: (string | number)[][] = [];
  out.push([`Dossier fiscal ${d.year}`, d.companyName]);
  out.push(["Forme juridique", LEGAL_FORM_LABELS[d.form]]);
  out.push([]);
  out.push(["COMPTE DE RÉSULTAT"]);
  out.push(["Produits", "", "CHF"]);
  for (const l of d.incomeStatement.productsByCategory) out.push(["", l.categoryLabel, chf(l.amount)]);
  out.push(["", "Total produits", chf(d.incomeStatement.totalProducts)]);
  out.push(["Charges", "", "CHF"]);
  for (const l of d.incomeStatement.expensesByCategory) out.push(["", l.categoryLabel, chf(l.amount)]);
  out.push(["", "Total charges", chf(d.incomeStatement.totalExpenses)]);
  out.push(["", d.incomeStatement.result >= 0 ? "Bénéfice" : "Perte", chf(d.incomeStatement.result)]);
  out.push([]);

  if (d.vat.subject) {
    out.push(["RÉCAPITULATIF TVA"]);
    out.push(["", "TVA collectée", chf(d.vat.collected)]);
    out.push(["", "Impôt préalable", chf(d.vat.inputTax)]);
    out.push(["", "TVA nette due (année)", chf(d.vat.netDue)]);
    if (d.vat.otherFunds900) out.push(["", "Subventions (900)", chf(d.vat.otherFunds900)]);
    if (d.vat.otherFunds910) out.push(["", "Dons/dividendes (910)", chf(d.vat.otherFunds910)]);
    out.push([]);
  }

  if (d.independentIncome !== undefined) {
    out.push(["REVENU DE L'ACTIVITÉ INDÉPENDANTE", "", chf(d.independentIncome)]);
    out.push(["", "(à reporter dans la déclaration privée + base AVS)"]);
  }
  if (d.associationProfit !== undefined) {
    out.push(["BÉNÉFICE IMPOSABLE (ASSOCIATION)", "", chf(d.associationProfit)]);
    out.push(["", "(pas de capital-actions)"]);
  }
  if (d.allocation) {
    out.push(["RÉPARTITION DU RÉSULTAT PAR ASSOCIÉ"]);
    if (d.allocationWarning) out.push(["", d.allocationWarning]);
    for (const a of d.allocation) out.push(["", `${a.name} (${(a.shareBps / 100).toFixed(2)} %)`, chf(a.amount)]);
  }
  if (d.corporate) {
    out.push(["IMPÔT SUR LE BÉNÉFICE ET LE CAPITAL (Sàrl/SA)"]);
    out.push(["", "Bénéfice imposable", chf(d.corporate.taxableProfit)]);
    out.push(["", "Capital propre imposable", chf(d.corporate.equityCapital)]);
    out.push(["", "— dont capital social", chf(d.corporate.shareCapital)]);
    out.push(["", "— dont réserves", chf(d.corporate.reserves)]);
    out.push(["", "Salaire du gérant", chf(d.corporate.managerSalary)]);
    out.push(["", "Dividendes proposés", chf(d.corporate.dividends)]);
  }

  if (d.investments.length) {
    out.push([]);
    out.push(["INVESTISSEMENTS (code 405)"]);
    for (const i of d.investments) out.push([i.date, `${i.number ?? ""} ${i.label}`.trim(), chf(i.amountChf)]);
  }
  return out;
}

export async function exportTaxExcel(d: TaxDossier): Promise<{ saved: boolean; path?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Exporter le dossier fiscal (Excel)",
    defaultPath: `dossier-fiscal-${d.year}.xlsx`,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (canceled || !filePath) return { saved: false };
  const ws = XLSX.utils.aoa_to_sheet(rows(d));
  ws["!cols"] = [{ wch: 14 }, { wch: 46 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Dossier ${d.year}`);
  XLSX.writeFile(wb, filePath);
  return { saved: true, path: filePath };
}

function html(d: TaxDossier): string {
  const tr = (r: (string | number)[]) => `<tr>${r.map((c, i) => `<td class="${i === 2 ? "r" : ""}">${c}</td>`).join("")}</tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;padding:32px;font-size:12px}
    h1{font-size:18px;margin:0 0 2px} .meta{color:#475569;margin-bottom:14px}
    table{width:100%;border-collapse:collapse} td{padding:4px 8px;border-bottom:1px solid #e2e8f0}
    .r{text-align:right;font-variant-numeric:tabular-nums}
  </style></head><body>
    <h1>Dossier fiscal ${d.year} — ${d.companyName}</h1>
    <div class="meta">${LEGAL_FORM_LABELS[d.form]} · aide à la déclaration (hors calcul du montant d'impôt)</div>
    <table>${rows(d).map(tr).join("")}</table>
  </body></html>`;
}

export async function exportTaxPdf(d: TaxDossier): Promise<{ saved: boolean; path?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Exporter le dossier fiscal (PDF)",
    defaultPath: `dossier-fiscal-${d.year}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { saved: false };
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html(d))}`);
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
    await writeFile(filePath, pdf);
    return { saved: true, path: filePath };
  } finally {
    win.destroy();
  }
}
