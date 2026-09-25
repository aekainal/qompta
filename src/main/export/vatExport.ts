/**
 * Generation of the VAT return exports (Excel and PDF) on the main side.
 */

import { writeFile } from "node:fs/promises";
import { BrowserWindow, dialog } from "electron";
import * as XLSX from "xlsx";
import { toReturnLines } from "../../shared/vat/returnLines.js";
import type { VatReturnResult } from "../../shared/vat/compute.js";

interface ExportContext {
  companyName: string;
  vatNumber: string | null;
  periodLabel: string;
  startDate: string;
  endDate: string;
  method: string;
  result: VatReturnResult;
}

function chf(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Builds the row table (code, label, base, tax) for the export. */
function buildRows(ctx: ExportContext): (string | number)[][] {
  const header = [
    ["Décompte TVA", ctx.companyName],
    ["N° TVA", ctx.vatNumber ?? ""],
    ["Période", `${ctx.periodLabel} (${ctx.startDate} → ${ctx.endDate})`],
    ["Méthode", ctx.method === "tdfn" ? "Taux de la dette fiscale nette" : "Effective"],
    [],
    ["Code", "Libellé", "Prestations CHF", "Impôt CHF"],
  ];
  const body = toReturnLines(ctx.result).map((l) => [
    l.code,
    l.label,
    chf(l.base),
    chf(l.tax),
  ]);
  return [...header, ...body];
}

export async function exportVatExcel(ctx: ExportContext): Promise<{ saved: boolean; path?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Exporter le décompte (Excel)",
    defaultPath: `decompte-tva-${ctx.periodLabel.replace(/\s/g, "-")}.xlsx`,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (canceled || !filePath) return { saved: false };

  const ws = XLSX.utils.aoa_to_sheet(buildRows(ctx));
  ws["!cols"] = [{ wch: 8 }, { wch: 52 }, { wch: 18 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Décompte TVA");
  XLSX.writeFile(wb, filePath);
  return { saved: true, path: filePath };
}

function buildHtml(ctx: ExportContext): string {
  const rows = toReturnLines(ctx.result)
    .map((l) => {
      const strong = l.total ? ' style="font-weight:600;background:#f1f5f9"' : "";
      return `<tr${strong}><td class="c">${l.code}</td><td>${l.label}</td><td class="r">${chf(l.base)}</td><td class="r">${chf(l.tax)}</td></tr>`;
    })
    .join("");
  const warn = ctx.result.coherenceWarning
    ? `<p class="warn">⚠ Incohérence : le total imposable (379) diffère du chiffre d'affaires imposable (299).</p>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;padding:32px;font-size:12px}
    h1{font-size:18px;margin:0 0 4px}
    .meta{color:#475569;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
    th{background:#e2e8f0}
    .r{text-align:right;font-variant-numeric:tabular-nums}
    .c{font-family:ui-monospace,monospace}
    .warn{color:#b91c1c;margin-top:12px}
  </style></head><body>
    <h1>Décompte TVA · ${ctx.companyName}</h1>
    <div class="meta">
      ${ctx.vatNumber ? `N° TVA : ${ctx.vatNumber} · ` : ""}Période : ${ctx.periodLabel} (${ctx.startDate} → ${ctx.endDate})
      · Méthode : ${ctx.method === "tdfn" ? "TDFN" : "effective"}
    </div>
    <table>
      <thead><tr><th>Code</th><th>Libellé</th><th class="r">Prestations CHF</th><th class="r">Impôt CHF</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${warn}
  </body></html>`;
}

export async function exportVatPdf(ctx: ExportContext): Promise<{ saved: boolean; path?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Exporter le décompte (PDF)",
    defaultPath: `decompte-tva-${ctx.periodLabel.replace(/\s/g, "-")}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { saved: false };

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(ctx))}`);
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
    await writeFile(filePath, pdf);
    return { saved: true, path: filePath };
  } finally {
    win.destroy();
  }
}
