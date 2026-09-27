/**
 * Typed IPC contract between renderer and main.
 *
 * Each channel is a `domain:action` key. The preload exposes `window.api.invoke`
 * and the main registers one handler per channel. The types below provide
 * end-to-end autocompletion.
 */

import type {
  AccountCategory,
  AccountCategoryInput,
  AssociateInput,
  AssociateRecord,
  BankAccount,
  BankAccountInput,
  Company,
  CompanyInput,
  CompanyVatSettings,
  Contract,
  ContractBlock,
  ContractInput,
  ContractStatus,
  ContractTemplate,
  Invoice,
  InvoiceAttachment,
  InvoiceFilters,
  InvoiceInput,
  InvoiceListResult,
  InvoicePayment,
  LegalFormChange,
  PeriodSelector,
  Quote,
  QuoteFilters,
  QuoteInput,
  QuoteStatus,
  QuoteWithLines,
  ThirdParty,
  ThirdPartyInput,
  ThirdPartyUsage,
  VatMethod,
  VatReturnRecord,
  VatReturnStatus,
} from "./types.js";
import type { FundContribution, FundContributionInput } from "./funding.js";
import type { CashReconciliation, CashReconciliationInput } from "./cashReconciliation.js";
import type { BrandFontFace, BrandSettings } from "./brand.js";
import type { Partner, PartnersSummary } from "./partners.js";
import type { ConvertLegalFormInput } from "./schemas/company.js";
import type { LegalForm } from "./legal-form.js";
import type { CompanyEquity } from "./equity.js";
import type { VatReturnResult } from "./vat/compute.js";
import type { CompanyDashboardResult } from "./dashboard.js";
import type { Objective, ObjectiveInput, ObjectiveProgress } from "./objectives.js";
import type { Dashboard, DashboardInput } from "./dashboards.js";
import type { TaxDossier } from "./tax/dossier.js";
import type { Signature, SignatureInput } from "./signatures.js";
import type { BackupConfig, BackupEntry } from "./backups.js";

/** Answer of the security channels that may fail on a user input (wrong password, etc.). */
export type SecurityResult = { ok: true } | { ok: false; error: string };

/** Encryption state at startup (setup and login screens). */
export interface SecurityStatus {
  /**
   * ready: data open; setup: nothing yet (create or enter a key, then a password);
   * locked: login required (password or Windows Hello); set-password: key of an
   * older version found, a login password must be chosen; recover: encrypted data
   * without a usable keyring, the recovery key is required.
   */
  state: "ready" | "setup" | "locked" | "set-password" | "recover";
  /** An encrypted database already exists on this machine. */
  hasEncryptedData: boolean;
  /** An old plaintext database (<= 1.19) is waiting to be encrypted. */
  hasLegacyData: boolean;
  /** The keyring file is also protected by the system vault (DPAPI / keychain). */
  keyProtected: boolean;
  /** Windows Hello unlocks the keyring (the prompt is offered right away). */
  helloEnrolled: boolean;
  defaultBackupDir: string;
  error: string | null;
}

/** Reply to a file open that may require the key of another machine. */
export type NeedsKey = { needsKey: true; path: string; message: string };

/** VAT return computed on the fly for a period. */
export interface VatComputeOutput {
  result: VatReturnResult;
  startDate: string;
  endDate: string;
  label: string;
  /** VAT return saved for this period, if any (closed). */
  record: VatReturnRecord | null;
}

export interface IpcContract {
  "companies:list": { input: { includeArchived?: boolean }; output: Company[] };
  "companies:get": { input: { id: string }; output: Company | null };
  "companies:create": { input: CompanyInput; output: Company };
  "companies:update": { input: { id: string } & Partial<CompanyInput>; output: Company };
  "companies:archive": { input: { id: string }; output: { ok: true } };
  "companies:duplicate": { input: { id: string; name: string }; output: Company };
  "companies:convertLegalForm": { input: ConvertLegalFormInput; output: LegalFormChange };
  "companies:legalFormHistory": { input: { companyId: string }; output: LegalFormChange[] };
  "companies:createTest": { input: { name?: string | null; legalForm: LegalForm }; output: Company };
  "companies:deleteTest": { input: { id: string }; output: { ok: true } };
  "companies:setStatus": { input: { id: string; status: string }; output: Company };
  "companyEquity:get": { input: { companyId: string }; output: CompanyEquity };
  "companyEquity:set": { input: { companyId: string; data: CompanyEquity }; output: CompanyEquity };

  "vatSettings:get": { input: { companyId: string }; output: CompanyVatSettings | null };
  "vatSettings:update": { input: CompanyVatSettings; output: CompanyVatSettings };

  "app:getActiveCompany": { input: void; output: string | null };
  "app:setActiveCompany": { input: { companyId: string | null }; output: { ok: true } };

  // Window controls (frameless mode)
  "window:minimize": { input: void; output: { ok: true } };
  "window:toggleMaximize": { input: void; output: { maximized: boolean } };
  "window:close": { input: void; output: { ok: true } };
  "window:isMaximized": { input: void; output: { maximized: boolean } };

  // Third parties
  "thirdParties:list": { input: { companyId: string; includeArchived?: boolean }; output: ThirdParty[] };
  "thirdParties:create": { input: { companyId: string; data: ThirdPartyInput }; output: ThirdParty };
  "thirdParties:update": { input: { companyId: string; id: string; data: Partial<ThirdPartyInput> }; output: ThirdParty };
  "thirdParties:archive": { input: { companyId: string; id: string }; output: { ok: true } };
  "thirdParties:usage": { input: { companyId: string; id: string }; output: ThirdPartyUsage };
  "thirdParties:delete": { input: { companyId: string; id: string }; output: { ok: true } };

  // Chart of accounts
  "accounts:list": { input: { companyId: string; includeArchived?: boolean }; output: AccountCategory[] };
  "accounts:create": { input: { companyId: string; data: AccountCategoryInput }; output: AccountCategory };
  "accounts:update": { input: { companyId: string; id: string; data: Partial<AccountCategoryInput> }; output: AccountCategory };
  "accounts:archive": { input: { companyId: string; id: string }; output: { ok: true } };

  // Invoices
  "invoices:list": { input: { companyId: string; filters?: InvoiceFilters }; output: InvoiceListResult };
  "invoices:get": { input: { companyId: string; id: string }; output: Invoice | null };
  "invoices:create": { input: { companyId: string; data: InvoiceInput }; output: Invoice };
  "invoices:update": { input: { companyId: string; id: string; data: InvoiceInput }; output: Invoice };
  "invoices:delete": { input: { companyId: string; id: string }; output: { ok: true } };
  "invoices:duplicate": { input: { companyId: string; id: string }; output: Invoice };
  "invoices:addPayment": { input: { companyId: string; invoiceId: string; date: string; amount: number }; output: Invoice };
  "invoices:payments": { input: { companyId: string; invoiceId: string }; output: InvoicePayment[] };
  "invoices:refreshOverdue": { input: { companyId: string; today: string }; output: { updated: number } };
  /** Next number in the FC series (customer invoices). */
  "invoices:nextNumber": { input: { companyId: string; issueDate: string }; output: { number: string } };

  // Bank details
  "bankAccounts:list": { input: { companyId: string; includeArchived?: boolean }; output: BankAccount[] };
  "bankAccounts:create": { input: { companyId: string; data: BankAccountInput }; output: BankAccount };
  "bankAccounts:update": { input: { companyId: string; id: string; data: Partial<BankAccountInput> }; output: BankAccount };
  "bankAccounts:archive": { input: { companyId: string; id: string }; output: { ok: true } };

  // Quotes
  "quotes:list": { input: { companyId: string; filters?: QuoteFilters }; output: Quote[] };
  "quotes:get": { input: { companyId: string; id: string }; output: QuoteWithLines | null };
  "quotes:nextNumber": { input: { companyId: string; issueDate: string }; output: { number: string } };
  "quotes:create": { input: { companyId: string; data: QuoteInput }; output: QuoteWithLines };
  "quotes:update": { input: { companyId: string; id: string; data: QuoteInput }; output: QuoteWithLines };
  "quotes:delete": { input: { companyId: string; id: string }; output: { ok: true } };
  "quotes:duplicate": { input: { companyId: string; id: string }; output: QuoteWithLines };
  /** Creates a revised version of a refused or expired quote, and links both. */
  "quotes:revise": { input: { companyId: string; id: string }; output: QuoteWithLines };
  "quotes:setStatus": { input: { companyId: string; id: string; status: QuoteStatus }; output: QuoteWithLines };
  /** Creates the sales invoice(s) derived from the quote (one per VAT rate). */
  "quotes:convertToInvoice": {
    input: { companyId: string; id: string; issueDate?: string; dueDate?: string | null };
    output: { invoices: Invoice[] };
  };
  "quotes:refreshExpired": { input: { companyId: string; today: string }; output: { updated: number } };
  "quotes:exportPdf": { input: { companyId: string; id: string }; output: { saved: boolean; path?: string } };
  "quotes:previewPdf": { input: { companyId: string; id: string }; output: { saved: boolean; path?: string } };

  // Contracts
  "contracts:list": { input: { companyId: string; status?: ContractStatus }; output: Contract[] };
  "contracts:get": { input: { companyId: string; id: string }; output: Contract | null };
  "contracts:nextNumber": { input: { companyId: string; issueDate: string }; output: { number: string } };
  "contracts:create": { input: { companyId: string; data: ContractInput }; output: Contract };
  "contracts:update": { input: { companyId: string; id: string; data: ContractInput }; output: Contract };
  "contracts:delete": { input: { companyId: string; id: string }; output: { ok: true } };
  "contracts:setStatus": {
    input: { companyId: string; id: string; status: ContractStatus; date?: string };
    output: Contract;
  };
  /** Prepares a contract from an accepted quote (not saved). */
  "contracts:fromQuote": {
    input: { companyId: string; quoteId: string; templateId?: string | null };
    output: ContractInput;
  };
  "contracts:templates": { input: { companyId: string }; output: ContractTemplate[] };
  "contracts:saveTemplate": {
    input: { companyId: string; id?: string | null; name: string; blocks: ContractBlock[]; isDefault?: boolean };
    output: ContractTemplate;
  };
  "contracts:deleteTemplate": { input: { companyId: string; id: string }; output: { ok: true } };
  "contracts:exportPdf": { input: { companyId: string; id: string }; output: { saved: boolean; path?: string } };
  "contracts:previewPdf": { input: { companyId: string; id: string }; output: { saved: boolean; path?: string } };

  // PDF of issued invoices (with QR payment part)
  "invoices:lines": { input: { companyId: string; id: string }; output: QuoteWithLines["lines"] };
  "invoices:saveLines": {
    input: { companyId: string; id: string; lines: QuoteInput["lines"] };
    output: { ok: true };
  };
  "invoices:exportPdf": {
    input: { companyId: string; id: string };
    output: { saved: boolean; path?: string; qrError?: string | null };
  };
  "invoices:previewPdf": {
    input: { companyId: string; id: string };
    output: { saved: boolean; path?: string; qrError?: string | null };
  };

  // Attachments (links to files)
  "attachments:list": { input: { companyId: string; invoiceId: string }; output: InvoiceAttachment[] };
  "attachments:pick": { input: { companyId: string; invoiceId: string }; output: InvoiceAttachment[] };
  "attachments:remove": { input: { companyId: string; id: string }; output: { ok: true } };
  "attachments:reveal": { input: { path: string }; output: { ok: boolean } };

  // VAT return
  "vat:compute": { input: PeriodSelector; output: VatComputeOutput };
  "vat:list": { input: { companyId: string }; output: VatReturnRecord[] };
  "vat:lock": { input: PeriodSelector & { method?: VatMethod }; output: VatReturnRecord };
  "vat:reopen": { input: { companyId: string; id: string }; output: VatReturnRecord };
  "vat:setStatus": { input: { companyId: string; id: string; status: VatReturnStatus }; output: VatReturnRecord };
  "vat:exportExcel": { input: PeriodSelector; output: { saved: boolean; path?: string } };
  "vat:exportPdf": { input: PeriodSelector; output: { saved: boolean; path?: string } };

  // Dashboards
  "dashboard:company": { input: { companyId: string; year: number }; output: CompanyDashboardResult };
  "dashboard:objectives": { input: { companyId: string }; output: ObjectiveProgress[] };
  "objectives:list": { input: { companyId: string }; output: Objective[] };
  "objectives:create": { input: { companyId: string; data: ObjectiveInput }; output: Objective };
  "objectives:update": { input: { companyId: string; id: string; data: Partial<ObjectiveInput> }; output: Objective };
  "objectives:delete": { input: { companyId: string; id: string }; output: { ok: true } };
  "dashboards:list": { input: { companyId: string }; output: Dashboard[] };
  "dashboards:create": { input: { companyId: string; data: DashboardInput }; output: Dashboard };
  "dashboards:update": { input: { companyId: string; id: string; data: Partial<DashboardInput> }; output: Dashboard };
  "dashboards:remove": { input: { companyId: string; id: string }; output: { ok: true } };

  // Shareholders (simple partnership / SNC)
  "associates:list": { input: { companyId: string }; output: AssociateRecord[] };
  "associates:create": { input: { companyId: string; data: AssociateInput }; output: AssociateRecord };
  "associates:update": { input: { companyId: string; id: string; data: Partial<AssociateInput> }; output: AssociateRecord };
  "associates:remove": { input: { companyId: string; id: string }; output: { ok: true } };

  // Fund contributions (money paid in by shareholders)
  "funding:list": { input: { companyId: string }; output: FundContribution[] };
  "funding:create": { input: { companyId: string; data: FundContributionInput }; output: FundContribution };
  "funding:update": { input: { companyId: string; id: string; data: FundContributionInput }; output: FundContribution };
  "funding:remove": { input: { companyId: string; id: string }; output: { ok: true } };
  "cashReconciliations:list": { input: { companyId: string }; output: CashReconciliation[] };
  "cashReconciliations:create": { input: { companyId: string; data: CashReconciliationInput }; output: CashReconciliation };
  "cashReconciliations:remove": { input: { companyId: string; id: string }; output: { ok: true } };

  // Branding of PDF documents (per company)
  "brand:get": { input: { companyId: string }; output: BrandSettings };
  "brand:update": { input: { companyId: string; data: BrandSettings }; output: BrandSettings };
  "brand:reset": { input: { companyId: string }; output: BrandSettings };
  /** Opens a file picker and returns the logo as a data-URI (without saving it). */
  "brand:pickLogo": { input: void; output: { image: string; name: string } | { canceled: true } };
  /** Opens a file picker and returns the font weights read (without saving them). */
  "brand:pickFont": { input: void; output: { faces: BrandFontFace[] } | { canceled: true } };
  /** PDF preview of a sample document, using settings not yet saved. */
  "brand:preview": {
    input: { companyId: string; data: BrandSettings };
    output: { saved: boolean; path?: string };
  };

  // Partners: company customers under contract
  "partners:list": { input: { companyId: string }; output: { partners: Partner[]; summary: PartnersSummary } };

  // Tax dossier
  "tax:dossier": { input: { companyId: string; year: number }; output: TaxDossier };
  "tax:exportPdf": { input: { companyId: string; year: number }; output: { saved: boolean; path?: string } };
  "tax:exportExcel": { input: { companyId: string; year: number }; output: { saved: boolean; path?: string } };

  // Handwritten signatures (shareholders)
  "signatures:list": { input: { companyId: string }; output: Signature[] };
  "signatures:create": { input: { companyId: string; data: SignatureInput }; output: Signature };
  "signatures:update": { input: { companyId: string; id: string; data: SignatureInput }; output: Signature };
  "signatures:remove": { input: { companyId: string; id: string }; output: { ok: true } };
  /** Opens an image picker and returns the signature as a data-URI (without saving it). */
  "signatures:pickImage": { input: void; output: { image: string; name: string } | { canceled: true } };

  // Encryption (available BEFORE the data is unlocked)
  "security:status": { input: void; output: SecurityStatus };
  /** Generates a new key (not yet saved) and returns its readable form. */
  "security:newKey": { input: void; output: { recoveryKey: string } };
  /** Writes the recovery key to a chosen text file (USB stick, etc.). */
  "security:saveKeyFile": { input: { recoveryKey: string }; output: { saved: boolean; path?: string } };
  /**
   * Adopts the key (new or entered, or the recovery key after a forgotten password),
   * protects it with the login password and opens the data.
   */
  "security:activate": { input: { recoveryKey: string; password: string }; output: SecurityResult };
  /** Migration from <= 1.20: protects the key already on the machine with a password. */
  "security:setPassword": { input: { password: string }; output: SecurityResult };
  /** Login with the password. */
  "security:unlock": { input: { password: string }; output: SecurityResult };
  /** Login with Windows Hello. */
  "security:unlockHello": { input: void; output: SecurityResult };
  /** Windows Hello can be used on this machine (Windows only; first answer takes a second or two). */
  "security:helloAvailable": { input: void; output: boolean };
  "security:enableHello": { input: void; output: SecurityResult };
  "security:disableHello": { input: void; output: SecurityResult };
  /** Replaces the login password; the current one is required. */
  "security:changePassword": { input: { current: string; next: string }; output: SecurityResult };
  /** Sets aside an unreadable database (lost key) to start over from scratch. */
  "security:resetData": { input: void; output: { ok: true; movedTo: string | null } };
  /** Recovery key of this machine, to write it down again; the password is required. */
  "security:revealKey": { input: { password: string }; output: { ok: true; recoveryKey: string } | { ok: false; error: string } };

  // Backup / restore / export (everything is encrypted)
  "backup:config": { input: void; output: BackupConfig };
  "backup:setConfig": { input: { dir?: string | null; retentionDays?: number }; output: BackupConfig };
  "backup:chooseDir": { input: void; output: { dir: string } | { canceled: true } };
  "backup:openDir": { input: void; output: { ok: true } };
  "backup:runNow": { input: void; output: { file: string; path: string; size: number } };
  "backup:list": { input: void; output: BackupEntry[] };
  /** Full encrypted backup (.qbak) to a chosen location. */
  "backup:saveAs": { input: void; output: { saved: boolean; path?: string } };
  /** Restores a full backup (.qbak, or legacy .sqlite). Without a path: file picker. */
  "backup:restore": {
    input: { path?: string | null; recoveryKey?: string | null };
    output: { restoring: true } | { canceled: true } | NeedsKey;
  };
  /** Encrypted export (.qexp) of one or all companies. */
  "backup:exportCompanies": { input: { scope: "all" | "company"; companyId?: string }; output: { saved: boolean; path?: string } };
  /** Imports an export (.qexp, or legacy .json): companies created as new entities. */
  "backup:importCompanies": {
    input: { path?: string | null; recoveryKey?: string | null };
    output: { imported: number; names: string[] } | { canceled: true } | NeedsKey;
  };
  "backup:exportExcel": { input: { companyId: string }; output: { saved: boolean; path?: string } };

  // Undo (action bar): log of the session's modifications
  "undo:checkpoint": { input: void; output: { seq: number } };
  /** Undoes the modifications between two log positions; -1 = too old. */
  "undo:revert": { input: { from: number; to: number }; output: { reverted: number } };
}

export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = IpcContract[C]["input"];
export type IpcOutput<C extends IpcChannel> = IpcContract[C]["output"];

/** Runtime list of channels (used to validate what the preload exposes). */
export const IPC_CHANNELS: IpcChannel[] = [
  "companies:list",
  "companies:get",
  "companies:create",
  "companies:update",
  "companies:archive",
  "companies:duplicate",
  "companies:convertLegalForm",
  "companies:legalFormHistory",
  "companies:createTest",
  "companies:deleteTest",
  "companies:setStatus",
  "companyEquity:get",
  "companyEquity:set",
  "vatSettings:get",
  "vatSettings:update",
  "app:getActiveCompany",
  "app:setActiveCompany",
  "window:minimize",
  "window:toggleMaximize",
  "window:close",
  "window:isMaximized",
  "thirdParties:list",
  "thirdParties:create",
  "thirdParties:update",
  "thirdParties:archive",
  "thirdParties:usage",
  "thirdParties:delete",
  "accounts:list",
  "accounts:create",
  "accounts:update",
  "accounts:archive",
  "invoices:list",
  "invoices:get",
  "invoices:create",
  "invoices:update",
  "invoices:delete",
  "invoices:duplicate",
  "invoices:addPayment",
  "invoices:payments",
  "invoices:refreshOverdue",
  "invoices:nextNumber",
  "bankAccounts:list",
  "bankAccounts:create",
  "bankAccounts:update",
  "bankAccounts:archive",
  "quotes:list",
  "quotes:get",
  "quotes:nextNumber",
  "quotes:create",
  "quotes:update",
  "quotes:delete",
  "quotes:duplicate",
  "quotes:revise",
  "quotes:setStatus",
  "quotes:convertToInvoice",
  "quotes:refreshExpired",
  "quotes:exportPdf",
  "quotes:previewPdf",
  "contracts:list",
  "contracts:get",
  "contracts:nextNumber",
  "contracts:create",
  "contracts:update",
  "contracts:delete",
  "contracts:setStatus",
  "contracts:fromQuote",
  "contracts:templates",
  "contracts:saveTemplate",
  "contracts:deleteTemplate",
  "contracts:exportPdf",
  "contracts:previewPdf",
  "invoices:lines",
  "invoices:saveLines",
  "invoices:exportPdf",
  "invoices:previewPdf",
  "attachments:list",
  "attachments:pick",
  "attachments:remove",
  "attachments:reveal",
  "vat:compute",
  "vat:list",
  "vat:lock",
  "vat:reopen",
  "vat:setStatus",
  "vat:exportExcel",
  "vat:exportPdf",
  "dashboard:company",
  "dashboard:objectives",
  "objectives:list",
  "objectives:create",
  "objectives:update",
  "objectives:delete",
  "dashboards:list",
  "dashboards:create",
  "dashboards:update",
  "dashboards:remove",
  "associates:list",
  "associates:create",
  "associates:update",
  "associates:remove",
  "funding:list",
  "funding:create",
  "funding:update",
  "funding:remove",
  "cashReconciliations:list",
  "cashReconciliations:create",
  "cashReconciliations:remove",
  "brand:get",
  "brand:update",
  "brand:reset",
  "brand:pickLogo",
  "brand:pickFont",
  "brand:preview",
  "partners:list",
  "tax:dossier",
  "tax:exportPdf",
  "tax:exportExcel",
  "signatures:list",
  "signatures:create",
  "signatures:update",
  "signatures:remove",
  "signatures:pickImage",
  "security:status",
  "security:newKey",
  "security:saveKeyFile",
  "security:activate",
  "security:setPassword",
  "security:unlock",
  "security:unlockHello",
  "security:helloAvailable",
  "security:enableHello",
  "security:disableHello",
  "security:changePassword",
  "security:resetData",
  "security:revealKey",
  "backup:config",
  "backup:setConfig",
  "backup:chooseDir",
  "backup:openDir",
  "backup:runNow",
  "backup:list",
  "backup:saveAs",
  "backup:restore",
  "backup:exportCompanies",
  "backup:importCompanies",
  "backup:exportExcel",
  "undo:checkpoint",
  "undo:revert",
];
