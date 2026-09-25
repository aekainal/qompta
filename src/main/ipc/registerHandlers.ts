/**
 * IPC handler registration on the main process side.
 * Each handler validates its input (zod) before calling the repositories.
 */

import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { app, dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import type { DB } from "../../db/client.js";
import type { DataStore } from "../storage.js";
import { writeAtomic } from "../storage.js";
import type { BackupService } from "../backups.js";
import { NeedsKeyError, unsealWithFallback } from "../backups.js";
import type { UndoJournal } from "../undo.js";
import { isVault, seal } from "../security/vault.js";
import { createSignaturesRepo } from "../../db/repositories/signatures.repo.js";
import { signatureInputSchema } from "../../shared/schemas/signatures.js";
import { SIGNATURE_MAX_BYTES } from "../../shared/signatures.js";
import { BACKUP_EXT, EXPORT_EXT, backupFileName } from "../../shared/backups.js";

/** Running under WSL? (to redirect to Windows Explorer). */
function isWsl(): boolean {
  return process.platform === "linux" && (!!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP);
}

/** Converts a WSL path /mnt/c/... into a Windows path C:\... */
function wslToWindowsPath(p: string): string | null {
  const m = /^\/mnt\/([a-z])\/(.*)$/i.exec(p);
  if (!m) return null;
  return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`;
}

/** Opens the system file explorer on the file (Windows Explorer under WSL). */
function revealInExplorer(p: string): void {
  if (isWsl()) {
    const winPath = wslToWindowsPath(p);
    if (winPath) {
      // explorer.exe returns a non-zero code even on success: we pay no attention to it.
      spawn("explorer.exe", [`/select,${winPath}`], { detached: true, stdio: "ignore" }).unref();
      return;
    }
  }
  shell.showItemInFolder(p);
}
import { createCompaniesRepo } from "../../db/repositories/companies.repo.js";
import { LEGAL_FORM_SHORT } from "../../shared/legal-form.js";
import { createCompanyEquityRepo } from "../../db/repositories/companyEquity.repo.js";
import { companyEquitySchema } from "../../shared/schemas/equity.js";
import { createSettingsRepo } from "../../db/repositories/settings.repo.js";
import { createAccountsRepo } from "../../db/repositories/accounts.repo.js";
import { createThirdPartiesRepo } from "../../db/repositories/thirdParties.repo.js";
import { createInvoicesRepo } from "../../db/repositories/invoices.repo.js";
import { createVatReturnsRepo } from "../../db/repositories/vatReturns.repo.js";
import { createAttachmentsRepo } from "../../db/repositories/attachments.repo.js";
import { createDashboardRepo } from "../../db/repositories/dashboard.repo.js";
import { createObjectivesRepo } from "../../db/repositories/objectives.repo.js";
import { randomUUID } from "node:crypto";
import { createDashboardsRepo } from "../../db/repositories/dashboards.repo.js";
import { DASHBOARD_TEMPLATES } from "../../shared/dashboards.js";
import { createAssociatesRepo } from "../../db/repositories/associates.repo.js";
import { createFundContributionsRepo } from "../../db/repositories/fundContributions.repo.js";
import { createCashReconciliationsRepo } from "../../db/repositories/cashReconciliations.repo.js";
import { createBrandRepo } from "../../db/repositories/brand.repo.js";
import { createPartnersRepo } from "../../db/repositories/partners.repo.js";
import { createTaxRepo } from "../../db/repositories/tax.repo.js";
import { createBackupRepo } from "../../db/repositories/backup.repo.js";
import { exportVatExcel, exportVatPdf } from "../export/vatExport.js";
import { exportTaxExcel, exportTaxPdf } from "../export/taxExport.js";
import { exportCompanyExcel } from "../export/dataExport.js";
import {
  companyInputSchema,
  companyVatSettingsSchema,
  convertLegalFormSchema,
} from "../../shared/schemas/company.js";
import {
  accountCategoryInputSchema,
  associateInputSchema,
  invoiceFiltersSchema,
  invoiceInputSchema,
  thirdPartyInputSchema,
} from "../../shared/schemas/invoice.js";
import { fundContributionInputSchema } from "../../shared/schemas/funding.js";
import { cashReconciliationInputSchema } from "../../shared/schemas/cashReconciliation.js";
import { objectiveInputSchema } from "../../shared/schemas/objectives.js";
import { dashboardInputSchema } from "../../shared/schemas/dashboards.js";
import { brandSettingsSchema } from "../../shared/schemas/brand.js";
import { BRAND_LIMITS, normalizeBrand } from "../../shared/brand.js";
import { createBankAccountsRepo } from "../../db/repositories/bankAccounts.repo.js";
import { createQuotesRepo } from "../../db/repositories/quotes.repo.js";
import { createContractsRepo } from "../../db/repositories/contracts.repo.js";
import {
  bankAccountInputSchema,
  contractInputSchema,
  contractTemplateInputSchema,
  documentLineSchema,
  quoteFiltersSchema,
  quoteInputSchema,
} from "../../shared/schemas/document.js";
import { fontsDir, previewPdf, renderHtmlToPdf, type HtmlSource } from "../export/pdf/render.js";
import {
  buildContractPdfHtml,
  buildInvoicePdfHtml,
  buildQuotePdfHtml,
} from "../export/pdf/build.js";
import { DEFAULT_CONTRACT_VARIABLES } from "../../shared/documents/contract-template.js";
import type { IpcChannel, IpcInput, IpcOutput } from "../../shared/ipc.js";
import type { DocumentLineRecord, PeriodType, Quote, ThirdParty } from "../../shared/types.js";

const ACTIVE_COMPANY_KEY = "active_company_id";

/** Main-process services the handlers need, in addition to the database. */
export interface HandlerContext {
  store: DataStore;
  backups: BackupService;
  undo: UndoJournal;
  key: Buffer;
}

export function registerHandlers(db: DB, ctx: HandlerContext): void {
  const { store, backups, undo, key } = ctx;
  const companies = createCompaniesRepo(db);
  const companyEquity = createCompanyEquityRepo(db);
  const settings = createSettingsRepo(db);
  const accounts = createAccountsRepo(db);
  const thirdParties = createThirdPartiesRepo(db);
  const invoicesRepo = createInvoicesRepo(db);
  const vatRepo = createVatReturnsRepo(db);
  const attachments = createAttachmentsRepo(db);
  const dashboard = createDashboardRepo(db);
  const objectives = createObjectivesRepo(db);
  const dashboardsRepo = createDashboardsRepo(db);
  const associates = createAssociatesRepo(db);
  const funding = createFundContributionsRepo(db);
  const cashReconciliations = createCashReconciliationsRepo(db);
  const brand = createBrandRepo(db);
  const partners = createPartnersRepo(db);
  const taxRepo = createTaxRepo(db);
  const backup = createBackupRepo(db);
  const bankAccounts = createBankAccountsRepo(db);
  const quotesRepo = createQuotesRepo(db, invoicesRepo);
  const contractsRepo = createContractsRepo(db);
  const signaturesRepo = createSignaturesRepo(db);
  /**
   * Printing context of a document: company, third party and bank account.
   * The account used is the document's, failing that the company's default one.
   */
  function documentContext(companyId: string, thirdPartyId: string | null, bankAccountId: string | null) {
    const company = companies.get(companyId);
    if (!company) throw new Error("Société introuvable");
    const thirdParty = thirdPartyId
      ? (thirdParties.list(companyId, true).find((t) => t.id === thirdPartyId) ?? null)
      : null;
    const bankAccount = bankAccountId
      ? bankAccounts.get(companyId, bankAccountId)
      : bankAccounts.getDefault(companyId);
    return {
      company,
      thirdParty,
      bankAccount,
      fontsDir: fontsDir(),
      brand: brand.get(companyId),
      signatures: signaturesRepo.list(companyId),
    };
  }

  function handle<C extends IpcChannel>(
    channel: C,
    fn: (input: IpcInput<C>) => IpcOutput<C> | Promise<IpcOutput<C>>,
  ): void {
    ipcMain.handle(channel, async (_evt, input) => {
      try {
        return await fn(input as IpcInput<C>);
      } finally {
        // The database lives in memory: every change is re-written encrypted to disk.
        store.touch();
      }
    });
  }

  // ── Companies ──
  handle("companies:list", ({ includeArchived }) => companies.list(includeArchived));
  handle("companies:get", ({ id }) => companies.get(id));
  handle("companies:create", (input) => {
    const parsed = companyInputSchema.parse(input);
    return companies.create(parsed);
  });
  handle("companies:update", ({ id, ...patch }) => companies.update(id, patch));
  handle("companies:archive", ({ id }) => companies.archive(id));
  // Test company: name prefixed with "TEST_", deletable (unlike real companies).
  handle("companies:createTest", ({ name, legalForm }) => {
    const base = (name ?? "").trim().replace(/^TEST_/i, "").trim();
    return companies.create({ name: `TEST_${base || LEGAL_FORM_SHORT[legalForm]}`, legalForm });
  });
  handle("companies:deleteTest", ({ id }) => {
    const c = companies.get(id);
    if (!c) throw new Error("Société introuvable.");
    if (!c.name.startsWith("TEST_")) {
      throw new Error("Seules les sociétés de test (préfixe TEST_) peuvent être supprimées ici.");
    }
    companies.remove(id);
    settings.delete(`dashboards:templatesVersion:${id}`);
    if (settings.get<string>(ACTIVE_COMPANY_KEY) === id) {
      settings.set(ACTIVE_COMPANY_KEY, companies.list()[0]?.id ?? null);
    }
    return { ok: true } as const;
  });
  handle("companies:setStatus", ({ id, status }) => companies.setStatus(id, status));
  handle("companyEquity:get", ({ companyId }) => companyEquity.get(companyId));
  handle("companyEquity:set", ({ companyId, data }) => companyEquity.set(companyId, companyEquitySchema.parse(data)));
  handle("companies:duplicate", ({ id, name }) => {
    const src = companies.get(id);
    if (!src) throw new Error("Société source introuvable");
    return companies.create({
      name,
      legalForm: src.legalForm,
      ideNumber: null,
      vatNumber: null,
      rcRegistered: src.rcRegistered,
      accountingMode: src.accountingMode,
      shareCapital: src.shareCapital,
      defaultCurrency: src.defaultCurrency,
      color: src.color,
    });
  });
  handle("companies:convertLegalForm", (input) => {
    const p = convertLegalFormSchema.parse(input);
    return companies.convertLegalForm(p.companyId, p.toForm, p.effectiveDate, p.note);
  });
  handle("companies:legalFormHistory", ({ companyId }) =>
    companies.legalFormHistory(companyId),
  );

  // ── VAT settings ──
  handle("vatSettings:get", ({ companyId }) => companies.getVatSettings(companyId));
  handle("vatSettings:update", (input) => {
    const p = companyVatSettingsSchema.parse(input);
    return companies.updateVatSettings(p);
  });

  // ── Application state ──
  handle("app:getActiveCompany", () => settings.get<string>(ACTIVE_COMPANY_KEY));
  handle("app:setActiveCompany", ({ companyId }) => {
    settings.set(ACTIVE_COMPANY_KEY, companyId);
    return { ok: true } as const;
  });

  // ── Third parties ──
  handle("thirdParties:list", ({ companyId, includeArchived }) =>
    thirdParties.list(companyId, includeArchived),
  );
  handle("thirdParties:create", ({ companyId, data }) =>
    thirdParties.create(companyId, thirdPartyInputSchema.parse(data)),
  );
  handle("thirdParties:update", ({ companyId, id, data }) =>
    thirdParties.update(companyId, id, thirdPartyInputSchema.partial().parse(data)),
  );
  handle("thirdParties:archive", ({ companyId, id }) => thirdParties.archive(companyId, id));
  handle("thirdParties:usage", ({ companyId, id }) => thirdParties.usage(companyId, id));
  handle("thirdParties:delete", ({ companyId, id }) => thirdParties.delete(companyId, id));

  // ── Chart of accounts ──
  handle("accounts:list", ({ companyId, includeArchived }) =>
    accounts.list(companyId, includeArchived),
  );
  handle("accounts:create", ({ companyId, data }) =>
    accounts.create(companyId, accountCategoryInputSchema.parse(data)),
  );
  handle("accounts:update", ({ companyId, id, data }) =>
    accounts.update(companyId, id, accountCategoryInputSchema.partial().parse(data)),
  );
  handle("accounts:archive", ({ companyId, id }) => accounts.archive(companyId, id));

  // ── Invoices ──
  handle("invoices:list", ({ companyId, filters }) =>
    invoicesRepo.list(companyId, filters ? invoiceFiltersSchema.parse(filters) : {}),
  );
  handle("invoices:get", ({ companyId, id }) => invoicesRepo.get(companyId, id));
  handle("invoices:create", ({ companyId, data }) =>
    invoicesRepo.create(companyId, invoiceInputSchema.parse(data)),
  );
  handle("invoices:update", ({ companyId, id, data }) =>
    invoicesRepo.update(companyId, id, invoiceInputSchema.parse(data)),
  );
  handle("invoices:delete", ({ companyId, id }) => {
    // The link to the quote disappears with the invoice: it is read beforehand.
    const quoteId = invoicesRepo.get(companyId, id)?.quoteId ?? null;
    const res = invoicesRepo.delete(companyId, id);
    // No invoice left ⇒ the source quote goes back to "accepted" and becomes
    // editable, deletable and convertible again.
    if (quoteId) quotesRepo.releaseInvoice(companyId, quoteId);
    return res;
  });
  handle("invoices:duplicate", ({ companyId, id }) => invoicesRepo.duplicate(companyId, id));
  handle("invoices:addPayment", ({ companyId, invoiceId, date, amount }) =>
    invoicesRepo.addPayment(companyId, invoiceId, date, amount),
  );
  handle("invoices:payments", ({ companyId, invoiceId }) =>
    invoicesRepo.payments(companyId, invoiceId),
  );
  handle("invoices:nextNumber", ({ companyId, issueDate }) => ({
    number: invoicesRepo.nextNumber(companyId, issueDate),
  }));

  // ── Bank details ──
  handle("bankAccounts:list", ({ companyId, includeArchived }) =>
    bankAccounts.list(companyId, includeArchived),
  );
  handle("bankAccounts:create", ({ companyId, data }) =>
    bankAccounts.create(companyId, bankAccountInputSchema.parse(data)),
  );
  handle("bankAccounts:update", ({ companyId, id, data }) =>
    bankAccounts.update(companyId, id, bankAccountInputSchema.partial().parse(data)),
  );
  handle("bankAccounts:archive", ({ companyId, id }) => bankAccounts.archive(companyId, id));

  // ── Quotes ──
  handle("quotes:list", ({ companyId, filters }) =>
    quotesRepo.list(companyId, filters ? quoteFiltersSchema.parse(filters) : {}),
  );
  handle("quotes:get", ({ companyId, id }) => quotesRepo.get(companyId, id));
  handle("quotes:nextNumber", ({ companyId, issueDate }) => ({
    number: quotesRepo.nextNumber(companyId, issueDate),
  }));
  handle("quotes:create", ({ companyId, data }) =>
    quotesRepo.create(companyId, quoteInputSchema.parse(data)),
  );
  handle("quotes:update", ({ companyId, id, data }) =>
    quotesRepo.update(companyId, id, quoteInputSchema.parse(data)),
  );
  handle("quotes:delete", ({ companyId, id }) => quotesRepo.delete(companyId, id));
  handle("quotes:duplicate", ({ companyId, id }) => quotesRepo.duplicate(companyId, id));
  handle("quotes:revise", ({ companyId, id }) => quotesRepo.revise(companyId, id));
  handle("quotes:setStatus", ({ companyId, id, status }) =>
    quotesRepo.setStatus(companyId, id, status),
  );
  handle("quotes:convertToInvoice", ({ companyId, id, issueDate, dueDate }) => ({
    invoices: quotesRepo.convertToInvoice(companyId, id, { issueDate, dueDate }),
  }));
  // Status refresh when the module opens: expired validity, and "invoiced"
  // quotes whose invoice no longer exists (they go back to "accepted").
  handle("quotes:refreshExpired", ({ companyId, today }) => ({
    updated: quotesRepo.refreshExpired(companyId, today) + quotesRepo.releaseOrphaned(companyId),
  }));

  /** HTML of a quote, ready to print. */
  function quoteHtml(
    companyId: string,
    id: string,
  ): { html: HtmlSource; number: string } {
    const quote = quotesRepo.get(companyId, id);
    if (!quote) throw new Error("Devis introuvable");
    const ctx = documentContext(companyId, quote.thirdPartyId, quote.bankAccountId);
    return { html: buildQuotePdfHtml(quote, quote.lines, ctx), number: quote.number };
  }

  handle("quotes:exportPdf", async ({ companyId, id }) => {
    const { html, number } = quoteHtml(companyId, id);
    return renderHtmlToPdf(html, `devis-${number}.pdf`, "Exporter le devis (PDF)");
  });
  handle("quotes:previewPdf", async ({ companyId, id }) => {
    const { html, number } = quoteHtml(companyId, id);
    return previewPdf(html, `devis-${number}.pdf`);
  });

  // ── Contracts ──
  handle("contracts:list", ({ companyId, status }) => contractsRepo.list(companyId, status));
  handle("contracts:get", ({ companyId, id }) => contractsRepo.get(companyId, id));
  handle("contracts:nextNumber", ({ companyId, issueDate }) => ({
    number: contractsRepo.nextNumber(companyId, issueDate),
  }));
  handle("contracts:create", ({ companyId, data }) =>
    contractsRepo.create(companyId, contractInputSchema.parse(data)),
  );
  handle("contracts:update", ({ companyId, id, data }) =>
    contractsRepo.update(companyId, id, contractInputSchema.parse(data)),
  );
  handle("contracts:delete", ({ companyId, id }) => contractsRepo.delete(companyId, id));
  handle("contracts:setStatus", ({ companyId, id, status, date }) =>
    contractsRepo.setStatus(companyId, id, status, date),
  );

  /**
   * Prepares a contract from an accepted quote: customer, subject and recurring
   * amount are carried over, the clauses are resolved with these values.
   */
  handle("contracts:fromQuote", ({ companyId, quoteId, templateId }) => {
    const quote = quotesRepo.get(companyId, quoteId);
    if (!quote) throw new Error("Devis introuvable");

    const thirdParty = quote.thirdPartyId
      ? (thirdParties.list(companyId, true).find((t) => t.id === quote.thirdPartyId) ?? null)
      : null;

    /*
     * The contract covers the WHOLE quote, one-off service lines included: it is
     * what secures payment of the fixed price as much as of the subscription.
     *
     * Split: on Qwasar quotes, a "section" line introduces the subscription
     * block. What precedes it is one-off, what follows it is recurring.
     * Without a section, the whole quote is treated as one-off.
     */
    let seenSection = false;
    let oneOffAmountHt = 0;
    let monthlyAmountHt = 0;
    let rateBps = 0;
    for (const line of quote.lines) {
      if (line.kind === "section") {
        seenSection = true;
        continue;
      }
      if (line.kind !== "item") continue;
      const amount = Math.round((line.qtyMilli * line.unitPriceHt) / 1000);
      if (seenSection) monthlyAmountHt += amount;
      else oneOffAmountHt += amount;
      rateBps = rateBps || line.vatRateBps;
    }

    const variables = {
      ...DEFAULT_CONTRACT_VARIABLES,
      provider: companies.get(companyId)?.name ?? "",
      subject: quote.title ?? "",
      client: thirdParty?.name ?? "",
      oneOffAmountHt: oneOffAmountHt || null,
      monthlyAmountHt: monthlyAmountHt || null,
    };

    const today = new Date().toISOString().slice(0, 10);
    return {
      quoteId: quote.id,
      thirdPartyId: quote.thirdPartyId,
      title: quote.title,
      issueDate: today,
      startDate: null,
      minDurationMonths: variables.minDurationMonths,
      noticeDays: variables.noticeDays,
      oneOffAmountHt: oneOffAmountHt || null,
      monthlyAmountHt: monthlyAmountHt || null,
      vatRateBps: rateBps,
      blocks: contractsRepo.blocksFor(companyId, variables, templateId),
      status: "draft" as const,
    };
  });

  handle("contracts:templates", ({ companyId }) => {
    // Guarantees the default template exists on first access.
    contractsRepo.defaultTemplate(companyId);
    return contractsRepo.listTemplates(companyId);
  });
  handle("contracts:saveTemplate", ({ companyId, id, ...data }) =>
    contractsRepo.saveTemplate(companyId, { id, ...contractTemplateInputSchema.parse(data) }),
  );
  handle("contracts:deleteTemplate", ({ companyId, id }) =>
    contractsRepo.deleteTemplate(companyId, id),
  );

  /** HTML of a contract, ready to print. */
  function contractHtml(companyId: string, id: string): { html: string; number: string } {
    const contract = contractsRepo.get(companyId, id);
    if (!contract) throw new Error("Contrat introuvable");
    const ctx = documentContext(companyId, contract.thirdPartyId, null);
    return { html: buildContractPdfHtml(contract, ctx), number: contract.number };
  }

  handle("contracts:exportPdf", async ({ companyId, id }) => {
    const { html, number } = contractHtml(companyId, id);
    return renderHtmlToPdf(html, `contrat-${number}.pdf`, "Exporter le contrat (PDF)");
  });
  handle("contracts:previewPdf", async ({ companyId, id }) => {
    const { html, number } = contractHtml(companyId, id);
    return previewPdf(html, `contrat-${number}.pdf`);
  });

  // ── PDF of issued invoices ──
  handle("invoices:lines", ({ companyId, id }) => quotesRepo.linesOf(companyId, "invoice", id));
  handle("invoices:saveLines", ({ companyId, id, lines }) => {
    quotesRepo.replaceLines(companyId, "invoice", id, z.array(documentLineSchema).parse(lines));
    return { ok: true } as const;
  });

  /** HTML of an invoice, with its QR payment part when it is possible. */
  function invoiceHtml(
    companyId: string,
    id: string,
  ): { html: HtmlSource; number: string; qrError: string | null } {
    const invoice = invoicesRepo.get(companyId, id);
    if (!invoice) throw new Error("Facture introuvable");
    const ctx = documentContext(companyId, invoice.thirdPartyId, invoice.bankAccountId);
    const lines = quotesRepo.linesOf(companyId, "invoice", id);
    const { html, qrError } = buildInvoicePdfHtml(invoice, lines, ctx);
    return { html, number: invoice.number ?? id.slice(0, 8), qrError };
  }

  handle("invoices:exportPdf", async ({ companyId, id }) => {
    const { html, number, qrError } = invoiceHtml(companyId, id);
    const res = await renderHtmlToPdf(html, `facture-${number}.pdf`, "Exporter la facture (PDF)");
    return { ...res, qrError };
  });
  handle("invoices:previewPdf", async ({ companyId, id }) => {
    const { html, number, qrError } = invoiceHtml(companyId, id);
    const res = await previewPdf(html, `facture-${number}.pdf`);
    return { ...res, qrError };
  });

  handle("invoices:refreshOverdue", ({ companyId, today }) => ({
    updated: invoicesRepo.refreshOverdue(companyId, today),
  }));

  // ── Attachments (links to files, no copy) ──
  handle("attachments:list", ({ companyId, invoiceId }) =>
    attachments.list(companyId, invoiceId),
  );
  handle("attachments:pick", async ({ companyId, invoiceId }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Lier un justificatif à la facture",
      properties: ["openFile", "multiSelections"],
    });
    if (canceled) return attachments.list(companyId, invoiceId);
    for (const p of filePaths) {
      let size: number | null = null;
      try {
        size = statSync(p).size;
      } catch {
        size = null;
      }
      attachments.add(companyId, invoiceId, { filePath: p, originalName: basename(p), size });
    }
    return attachments.list(companyId, invoiceId);
  });
  handle("attachments:remove", ({ companyId, id }) => attachments.remove(companyId, id));
  handle("attachments:reveal", ({ path }) => {
    revealInExplorer(path);
    return { ok: true };
  });

  // ── VAT return ──
  handle("vat:compute", ({ companyId, periodType, year, periodIndex }) => {
    const { result, range } = vatRepo.computeLive(companyId, periodType, year, periodIndex);
    const record = vatRepo.findRecord(companyId, periodType, year, periodIndex ?? null);
    return { result, startDate: range.startDate, endDate: range.endDate, label: range.label, record };
  });
  handle("vat:list", ({ companyId }) => vatRepo.list(companyId));
  handle("vat:lock", ({ companyId, periodType, year, periodIndex, method }) =>
    vatRepo.lock(companyId, periodType, year, periodIndex ?? null, method),
  );
  handle("vat:reopen", ({ companyId, id }) => vatRepo.reopen(companyId, id));
  handle("vat:setStatus", ({ companyId, id, status }) =>
    vatRepo.setStatus(companyId, id, status),
  );

  function exportContext(
    companyId: string,
    periodType: PeriodType,
    year: number,
    periodIndex?: number | null,
  ) {
    const company = companies.get(companyId);
    if (!company) throw new Error("Société introuvable");
    const { result, range } = vatRepo.computeLive(companyId, periodType, year, periodIndex);
    return {
      companyName: company.name,
      vatNumber: company.vatNumber,
      periodLabel: range.label,
      startDate: range.startDate,
      endDate: range.endDate,
      method: "effective",
      result,
    };
  }

  handle("vat:exportExcel", ({ companyId, periodType, year, periodIndex }) =>
    exportVatExcel(exportContext(companyId, periodType, year, periodIndex)),
  );
  handle("vat:exportPdf", ({ companyId, periodType, year, periodIndex }) =>
    exportVatPdf(exportContext(companyId, periodType, year, periodIndex)),
  );

  // ── Dashboards ──
  handle("dashboard:company", ({ companyId, year }) => dashboard.company(companyId, year));
  handle("dashboard:objectives", ({ companyId }) => dashboard.objectivesProgress(companyId));

  // ── Targets ──
  handle("objectives:list", ({ companyId }) => objectives.list(companyId));
  handle("objectives:create", ({ companyId, data }) =>
    objectives.create(companyId, objectiveInputSchema.parse(data)),
  );
  handle("objectives:update", ({ companyId, id, data }) =>
    objectives.update(companyId, id, objectiveInputSchema.partial().parse(data)),
  );
  handle("objectives:delete", ({ companyId, id }) => objectives.delete(companyId, id));

  // ── Custom dashboards ──
  handle("dashboards:list", ({ companyId }) => {
    const list = dashboardsRepo.listOrSeed(companyId);
    // Default template upgrade, in TIERS (per-company version flag):
    //  - guarantees the missing templates exist (by name), without touching custom
    //    dashboards nor the user's 3 core ones;
    //  - at tier 2, replaces the 2 templates "Rentabilité"/"Clients & pipeline"
    //    added in their basic version by the enriched one, and adds "Encaissement
    //    & créances". The flag prevents any re-adding afterwards.
    const key = `dashboards:templatesVersion:${companyId}`;
    const TARGET = 2;
    const version = settings.get<number>(key) ?? 0;
    if (version >= TARGET) return list;
    if (version >= 1) {
      for (const d of list) {
        if (d.name === "Rentabilité" || d.name === "Clients & pipeline") dashboardsRepo.remove(companyId, d.id);
      }
    }
    const names = new Set(dashboardsRepo.list(companyId).map((d) => d.name));
    for (const t of DASHBOARD_TEMPLATES) {
      if (!names.has(t.name)) {
        dashboardsRepo.create(companyId, {
          name: t.name,
          position: 999,
          widgets: t.widgets.map((w) => ({ ...w, id: randomUUID() })),
        });
      }
    }
    settings.set(key, TARGET);
    return dashboardsRepo.list(companyId);
  });
  handle("dashboards:create", ({ companyId, data }) =>
    dashboardsRepo.create(companyId, dashboardInputSchema.parse(data)),
  );
  handle("dashboards:update", ({ companyId, id, data }) =>
    dashboardsRepo.update(companyId, id, dashboardInputSchema.partial().parse(data)),
  );
  handle("dashboards:remove", ({ companyId, id }) => dashboardsRepo.remove(companyId, id));

  // ── Shareholders ──
  handle("associates:list", ({ companyId }) => associates.list(companyId));
  handle("associates:create", ({ companyId, data }) =>
    associates.create(companyId, associateInputSchema.parse(data)),
  );
  handle("associates:update", ({ companyId, id, data }) =>
    associates.update(companyId, id, associateInputSchema.partial().parse(data)),
  );
  handle("associates:remove", ({ companyId, id }) => associates.remove(companyId, id));

  // ── Fund contributions (shareholder contributions) ──
  handle("funding:list", ({ companyId }) => funding.list(companyId));
  handle("funding:create", ({ companyId, data }) =>
    funding.create(companyId, fundContributionInputSchema.parse(data)),
  );
  handle("funding:update", ({ companyId, id, data }) =>
    funding.update(companyId, id, fundContributionInputSchema.parse(data)),
  );
  handle("funding:remove", ({ companyId, id }) => funding.remove(companyId, id));

  // ── Cash reconciliations (resetting to the actual balance) ──
  handle("cashReconciliations:list", ({ companyId }) => cashReconciliations.list(companyId));
  handle("cashReconciliations:create", ({ companyId, data }) =>
    cashReconciliations.create(companyId, cashReconciliationInputSchema.parse(data)),
  );
  handle("cashReconciliations:remove", ({ companyId, id }) =>
    cashReconciliations.remove(companyId, id),
  );

  // ── PDF document branding ──
  handle("brand:get", ({ companyId }) => brand.get(companyId));
  handle("brand:update", ({ companyId, data }) =>
    brand.update(companyId, brandSettingsSchema.parse(data)),
  );
  handle("brand:reset", ({ companyId }) => brand.reset(companyId));

  handle("brand:pickLogo", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Choisir un logo",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg", "webp", "gif"] }],
    });
    if (canceled || !filePaths[0]) return { canceled: true } as const;

    const file = filePaths[0];
    const size = statSync(file).size;
    if (size > BRAND_LIMITS.logoImageBytes) {
      // The logo is stored in the database and copied into every PDF: beyond that,
      // the database swells and rendering slows down for no visual gain.
      throw new Error(
        `Logo trop lourd (${(size / 1024 / 1024).toFixed(1)} Mo). Maximum : ` +
          `${BRAND_LIMITS.logoImageBytes / 1024 / 1024} Mo.`,
      );
    }
    const ext = basename(file).split(".").pop()?.toLowerCase() ?? "png";
    const mime =
      ext === "svg" ? "image/svg+xml"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/png";
    return {
      image: `data:${mime};base64,${readFileSync(file).toString("base64")}`,
      name: basename(file),
    };
  });

  /**
   * Company-supplied fonts: several files at once (one weight per file). The
   * weight is guessed from the file name (foundries almost always name it)
   * and stays editable in the settings screen.
   */
  handle("brand:pickFont", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Choisir un ou plusieurs fichiers de police",
      properties: ["openFile", "multiSelections"],
      // On Windows, installed fonts live in C:\\Windows\\Fonts.
      defaultPath: process.platform === "win32" ? "C:\\Windows\\Fonts" : undefined,
      filters: [{ name: "Polices", extensions: ["ttf", "otf", "woff", "woff2"] }],
    });
    if (canceled || filePaths.length === 0) return { canceled: true } as const;

    const faces = filePaths.slice(0, BRAND_LIMITS.maxFontFaces).map((file) => {
      const size = statSync(file).size;
      if (size > BRAND_LIMITS.fontFileBytes) {
        throw new Error(
          `${basename(file)} est trop lourd (${(size / 1024 / 1024).toFixed(1)} Mo). ` +
            `Maximum : ${BRAND_LIMITS.fontFileBytes / 1024 / 1024} Mo par fichier.`,
        );
      }
      const name = basename(file);
      const lower = name.toLowerCase();
      const ext = lower.split(".").pop() ?? "ttf";
      const mime =
        ext === "otf" ? "font/otf" : ext === "woff" ? "font/woff" : ext === "woff2" ? "font/woff2" : "font/ttf";
      const weight =
        /black|heavy|ultra/.test(lower) ? 900
        : /extrabold|semibold|bold/.test(lower) ? 700
        : /light|thin/.test(lower) ? 300
        : 400;
      return {
        weight,
        style: /italic|oblique/.test(lower) ? ("italic" as const) : ("normal" as const),
        data: `data:${mime};base64,${readFileSync(file).toString("base64")}`,
        name,
      };
    });
    return { faces };
  });

  /**
   * Preview on a sample document: the real company (address, color), a fictional
   * customer and service lines. Lets the branding be tuned without having to
   * create a real quote, and with settings that are not saved yet.
   */
  handle("brand:preview", async ({ companyId, data }) => {
    const company = companies.get(companyId);
    if (!company) throw new Error("Société introuvable");
    const settings = normalizeBrand(brandSettingsSchema.parse(data));

    const today = new Date().toISOString().slice(0, 10);
    const sample: Quote = {
      id: "apercu",
      companyId,
      number: "DC" + today.replace(/-/g, "") + "01",
      issueDate: today,
      validUntil: null,
      thirdPartyId: null,
      title: "Exemple de mise en page",
      status: "draft",
      currency: company.defaultCurrency,
      amountHt: 0,
      vatAmount: 0,
      amountTtc: 0,
      vatNote: null,
      notes: null,
      bankAccountId: null,
      acceptedAt: null,
      invoiceId: null,
      contractId: null,
      supersededByQuoteId: null,
      signatureId: null,
      createdAt: today,
      updatedAt: today,
    };
    const sampleLines: DocumentLineRecord[] = [
      { id: "l1", kind: "item", label: "Prestation d'exemple", qtyMilli: 1000, unitPriceHt: 250000, vatRateBps: 810 },
      { id: "l2", kind: "detail", label: "Ce qu'elle comprend", qtyMilli: 1000, unitPriceHt: 0, vatRateBps: 810 },
      { id: "l3", kind: "item", label: "Seconde prestation", qtyMilli: 2000, unitPriceHt: 45000, vatRateBps: 810 },
    ];
    const sampleClient: ThirdParty = {
      id: "apercu-client",
      companyId,
      kind: "client",
      entityType: "company",
      name: "Client d'exemple SA",
      addressJson: null,
      addressLine2: null,
      email: null,
      phone: null,
      vatNumber: null,
      rcNumber: null,
      notes: null,
      archived: false,
      street: "Rue de l'Exemple",
      buildingNumber: "1",
      zip: "2000",
      city: "Neuchâtel",
      country: "CH",
    };

    const html = buildQuotePdfHtml(sample, sampleLines, {
      company,
      thirdParty: sampleClient,
      bankAccount: null,
      fontsDir: fontsDir(),
      brand: settings,
      signatures: signaturesRepo.list(companyId),
    });
    return previewPdf(html, "apercu-apparence.pdf");
  });

  // ── Partners ──
  handle("partners:list", ({ companyId }) => partners.list(companyId));

  // ── Tax file ──
  handle("tax:dossier", ({ companyId, year }) => taxRepo.dossier(companyId, year));
  handle("tax:exportPdf", ({ companyId, year }) => exportTaxPdf(taxRepo.dossier(companyId, year)));
  handle("tax:exportExcel", ({ companyId, year }) => exportTaxExcel(taxRepo.dossier(companyId, year)));

  // ── Handwritten signatures ──
  handle("signatures:list", ({ companyId }) => signaturesRepo.list(companyId));
  handle("signatures:create", ({ companyId, data }) =>
    signaturesRepo.create(companyId, signatureInputSchema.parse(data)),
  );
  handle("signatures:update", ({ companyId, id, data }) =>
    signaturesRepo.update(companyId, id, signatureInputSchema.parse(data)),
  );
  handle("signatures:remove", ({ companyId, id }) => signaturesRepo.remove(companyId, id));
  handle("signatures:pickImage", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Choisir l'image de la signature",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }],
    });
    if (canceled || !filePaths[0]) return { canceled: true } as const;
    const file = filePaths[0];
    const size = statSync(file).size;
    if (size > SIGNATURE_MAX_BYTES) {
      throw new Error(
        `Image trop lourde (${(size / 1024 / 1024).toFixed(1)} Mo). Maximum : ` +
          `${(SIGNATURE_MAX_BYTES / 1024 / 1024).toFixed(1)} Mo.`,
      );
    }
    const ext = basename(file).split(".").pop()?.toLowerCase() ?? "png";
    const mime =
      ext === "svg" ? "image/svg+xml"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "webp" ? "image/webp"
      : "image/png";
    return { image: `data:${mime};base64,${readFileSync(file).toString("base64")}`, name: basename(file) };
  });

  // ── Undo (action bar) ──
  handle("undo:checkpoint", () => ({ seq: undo.checkpoint() }));
  handle("undo:revert", ({ from, to }) => {
    const reverted = undo.revert(from, to);
    if (reverted < 0) throw new Error("Trop tard pour annuler cette opération.");
    return { reverted };
  });

  // ── Backups (all encrypted with the machine key) ──
  handle("backup:config", () => backups.config());
  handle("backup:setConfig", (patch) => backups.setConfig(patch));
  handle("backup:chooseDir", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Dossier des sauvegardes automatiques",
      defaultPath: backups.config().dir,
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths[0]) return { canceled: true } as const;
    return { dir: filePaths[0] };
  });
  handle("backup:openDir", async () => {
    backups.ensureDefaultDir();
    await shell.openPath(backups.config().dir);
    return { ok: true } as const;
  });
  handle("backup:runNow", () => backups.run());
  handle("backup:list", () => backups.list());

  handle("backup:saveAs", async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Sauvegarde complète chiffrée",
      defaultPath: join(backups.config().dir, backupFileName(new Date(), "manuelle")),
      filters: [{ name: "Sauvegarde Qompta", extensions: [BACKUP_EXT.slice(1)] }],
    });
    if (canceled || !filePath) return { saved: false };
    backups.writeTo(filePath);
    return { saved: true, path: filePath };
  });

  /**
   * Full restore: the current database is backed up first (rollback stays
   * possible), then replaced (re-encrypted with THIS machine's key) and the
   * application restarts.
   */
  handle("backup:restore", async ({ path, recoveryKey }) => {
    let file = path ?? null;
    if (!file) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Restaurer une sauvegarde complète",
        defaultPath: backups.config().dir,
        properties: ["openFile"],
        filters: [{ name: "Sauvegarde Qompta", extensions: [BACKUP_EXT.slice(1), "sqlite"] }],
      });
      if (canceled || !filePaths[0]) return { canceled: true } as const;
      file = filePaths[0];
    }
    let image: Buffer;
    try {
      image = backups.readImage(file, recoveryKey);
    } catch (err) {
      if (err instanceof NeedsKeyError) return { needsKey: true, path: file, message: err.message } as const;
      throw err;
    }
    const confirm = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Annuler", "Restaurer et redémarrer"],
      defaultId: 0,
      cancelId: 0,
      message: "Remplacer toutes les données actuelles par cette sauvegarde ?",
      detail:
        "Les données actuelles sont d'abord sauvegardées dans le dossier des sauvegardes " +
        "(« avant-restauration »), puis l'application redémarre.",
    });
    if (confirm.response !== 1) return { canceled: true } as const;

    backups.run("avant-restauration");
    store.freeze();
    writeAtomic(join(app.getPath("userData"), "qompta.qdb"), seal(image, key, "database"));
    app.relaunch();
    app.exit(0);
    return { restoring: true } as const;
  });

  handle("backup:exportCompanies", async ({ scope, companyId }) => {
    const now = new Date();
    const data = scope === "company" && companyId
      ? backup.exportCompany(companyId, now.toISOString())
      : backup.exportAll(now.toISOString());
    const name = scope === "company" && companyId ? companies.get(companyId)?.name ?? "societe" : "toutes";
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Exporter (chiffré)",
      defaultPath: join(
        backups.config().dir,
        `Qompta_export_${name.replace(/[^\w-]+/g, "_")}_${now.toISOString().slice(0, 10)}${EXPORT_EXT}`,
      ),
      filters: [{ name: "Export Qompta", extensions: [EXPORT_EXT.slice(1)] }],
    });
    if (canceled || !filePath) return { saved: false };
    writeAtomic(filePath, seal(Buffer.from(JSON.stringify(data), "utf8"), key, "export"));
    return { saved: true, path: filePath };
  });

  handle("backup:importCompanies", async ({ path, recoveryKey }) => {
    let file = path ?? null;
    if (!file) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Importer des sociétés",
        defaultPath: backups.config().dir,
        properties: ["openFile"],
        filters: [{ name: "Export Qompta", extensions: [EXPORT_EXT.slice(1), "json"] }],
      });
      if (canceled || !filePaths[0]) return { canceled: true } as const;
      file = filePaths[0];
    }
    const raw = readFileSync(file);
    let json: string;
    if (isVault(raw)) {
      try {
        const opened = unsealWithFallback(raw, key, recoveryKey);
        if (opened.kind !== "export") {
          throw new Error("Ce fichier est une sauvegarde complète : utilisez « Restaurer une sauvegarde ».");
        }
        json = opened.payload.toString("utf8");
      } catch (err) {
        if (err instanceof NeedsKeyError) return { needsKey: true, path: file, message: err.message } as const;
        throw err;
      }
    } else {
      // Old plaintext JSON export (≤ 1.19), accepted so that nothing is lost.
      json = raw.toString("utf8");
    }
    return backup.importFile(JSON.parse(json));
  });

  handle("backup:exportExcel", ({ companyId }) => {
    const company = companies.get(companyId);
    if (!company) throw new Error("Société introuvable");
    return exportCompanyExcel({
      companyName: company.name,
      invoices: invoicesRepo.list(companyId, { limit: 1000 }).rows,
      thirdParties: thirdParties.list(companyId, true),
    });
  });
}
