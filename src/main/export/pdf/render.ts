/**
 * PDF rendering of commercial documents: HTML -> offscreen BrowserWindow -> printToPDF.
 * Same chain as the VAT return exports, with the QWASAR template.
 */

import { rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
import {
  CONTENT_BAND_MM,
  LAYOUT,
  MAX_REPEATED_HEADER_MM,
  type DocumentLayout,
} from "./theme.js";

/**
 * Folder of the Inter fonts, depending on the execution context.
 * - dev (electron-vite): source tree `resources/fonts`.
 * - packaged: copied outside the asar into the resources (see electron-builder.yml).
 *
 * It starts from `app.getAppPath()` and not from `__dirname`: in development the
 * main is bundled into `out/main/`, so a path relative to the module does not
 * match the source tree.
 */
export function fontsDir(): string {
  const dir = app.isPackaged
    ? join(process.resourcesPath, "fonts")
    : join(app.getAppPath(), "resources", "fonts");

  if (!existsSync(join(dir, "inter-400-normal.woff2"))) {
    throw new Error(
      `Polices introuvables dans « ${dir} ». Les PDF ne peuvent pas être générés ` +
        `sans les fichiers Inter (resources/fonts).`,
    );
  }
  return dir;
}

export interface RenderResult {
  saved: boolean;
  path?: string;
}

/**
 * Source of a document: either frozen HTML, or a builder that receives the
 * measured pagination. The second form serves quotes and invoices: the QR-bill
 * must sit at the bottom of the LAST page, which requires knowing the number of
 * pages *and* the usable height of a page (297 mm minus the repeated header,
 * whose height varies with the customer address). Both are measured on a first
 * render, hence the double printing.
 */
export type HtmlSource = string | ((layout: DocumentLayout) => string);

/**
 * Number of pages of a PDF produced by Chromium.
 * Skia writes the objects in plain text: counting the `/Type /Page` dictionaries
 * (without the `s` of `/Pages`) is enough. Any anomaly falls back to 1 page.
 */
export function countPdfPages(pdf: Buffer): number {
  const matches = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return matches?.length || 1;
}

/**
 * Converts a complete HTML document to PDF and offers to save it.
 * `printBackground` is essential: without it the Q band disappears.
 */
export async function renderHtmlToPdf(
  html: HtmlSource,
  defaultFileName: string,
  dialogTitle: string,
): Promise<RenderResult> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: dialogTitle,
    defaultPath: defaultFileName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { saved: false };

  const pdf = await htmlToPdfBuffer(html);
  await writeFile(filePath, pdf);
  return { saved: true, path: filePath };
}

/**
 * Generates the PDF in memory, without a dialog (preview, sending, tests).
 *
 * The HTML goes through a temporary file rather than a `data:` URL: with the
 * Inter fonts in base64 and the QR payment part, a document exceeds 400 KB, and
 * its data-URL encoding comes close to Chromium's navigation limits.
 */
export async function htmlToPdfBuffer(html: HtmlSource): Promise<Buffer> {
  const tmpFiles: string[] = [];
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: false },
  });

  /** Loads an HTML document into the offscreen window, fonts applied. */
  async function load(source: string): Promise<void> {
    const tmp = join(app.getPath("temp"), `qompta-render-${randomUUID()}.html`);
    tmpFiles.push(tmp);
    await writeFile(tmp, source, "utf8");
    await win.loadFile(tmp);
    // Lets the engine apply the embedded @font-face rules before any measurement.
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
  }

  async function print(source: string): Promise<Buffer> {
    await load(source);
    return win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { marginType: "none" },
    });
  }

  /** Height of a document element, in millimetres (0 if absent). */
  async function measureMm(selector: string): Promise<number> {
    const value: unknown = await win.webContents.executeJavaScript(
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        return el ? el.getBoundingClientRect().height / (96 / 25.4) : 0;
      })()`,
    );
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  try {
    if (typeof html === "string") return await print(html);

    // 1. Measurement load: how much height does the `thead` (margin + header)
    //    take on each page? No printing, only the DOM.
    await load(html({ pages: 0, bandMm: CONTENT_BAND_MM, repeatHeader: true }));
    const theadMm = await measureMm("table.sheet > thead");

    // 2. Beyond the threshold, Chromium stops replaying the header: it is not
    //    repeated, and the usable band falls back to the plain margin spacer.
    const repeatHeader = theadMm > 0 && theadMm <= MAX_REPEATED_HEADER_MM;
    const bandMm = 297 - (repeatHeader ? theadMm : LAYOUT.marginTop);

    // 3. Measurement print: nothing is stretched (pages = 0), the pagination
    //    obtained is the shortest possible, the one the final render reproduces.
    const probe = await print(html({ pages: 0, bandMm, repeatHeader }));
    const pages = countPdfPages(probe);

    return await print(html({ pages, bandMm, repeatHeader }));
  } finally {
    win.destroy();
    await Promise.all(tmpFiles.map((f) => rm(f, { force: true })));
  }
}

/** Generates then opens the PDF in the system viewer (quick preview). */
export async function previewPdf(html: HtmlSource, fileName: string): Promise<RenderResult> {
  const target = join(app.getPath("temp"), fileName);
  await writeFile(target, await htmlToPdfBuffer(html));
  await shell.openPath(target);
  return { saved: true, path: target };
}
