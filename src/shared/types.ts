/**
 * Domain types shared between main and renderer.
 */

import type { LegalForm } from "./legal-form.js";

export type CompanyStatus = "active" | "archived";
export type AccountingMode = "simple" | "double";

export interface Company extends CompanyDocumentInfo {
  id: string;
  name: string;
  legalForm: LegalForm;
  ideNumber: string | null;
  vatNumber: string | null;
  rcRegistered: boolean;
  addressJson: string | null;
  accountingMode: AccountingMode;
  shareCapital: number | null;
  defaultCurrency: string;
  color: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CompanyInput {
  name: string;
  legalForm: LegalForm;
  ideNumber?: string | null;
  vatNumber?: string | null;
  rcRegistered?: boolean;
  accountingMode?: AccountingMode;
  shareCapital?: number | null;
  defaultCurrency?: string;
  color?: string | null;
  // ── Contact details printed on the documents ──
  rcNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  street?: string | null;
  buildingNumber?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  logoText?: string | null;
}

/** Company contact details carried over to quotes, invoices and contracts. */
export interface CompanyDocumentInfo {
  rcNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  street: string | null;
  buildingNumber: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  logoText: string | null;
}

export type PeriodType = "quarterly" | "semestrial" | "annual";
export type VatMethod = "effective" | "tdfn";
export type AccountingBasis = "agreed" | "received";

export interface CompanyVatSettings {
  companyId: string;
  isVatSubject: boolean;
  periodType: PeriodType;
  method: VatMethod;
  accountingBasis: AccountingBasis;
}

// ───────────────────────────── Shareholders ─────────────────────────────

export interface AssociateRecord {
  id: string;
  companyId: string;
  name: string;
  shareBps: number;
  role: string | null;
  fromDate: string;
  toDate: string | null;
}

export interface AssociateInput {
  name: string;
  shareBps: number;
  role?: string | null;
  fromDate?: string;
}

export interface LegalFormChange {
  id: string;
  companyId: string;
  fromForm: LegalForm | null;
  toForm: LegalForm;
  effectiveDate: string;
  note: string | null;
  createdAt: string;
}

// ───────────────────────────── Third parties ─────────────────────────────

export type ThirdPartyKind = "client" | "supplier" | "both";

/** Legal nature of the third party: a company or a natural person. */
export type EntityType = "company" | "person";

/** Structured address: carried over to the documents, required by the QR-bill. */
export interface StructuredAddress {
  addressLine2: string | null;
  street: string | null;
  buildingNumber: string | null;
  zip: string | null;
  city: string | null;
  country: string;
}

export interface ThirdParty extends StructuredAddress {
  id: string;
  companyId: string;
  kind: ThirdPartyKind;
  entityType: EntityType;
  name: string;
  addressJson: string | null;
  email: string | null;
  phone: string | null;
  vatNumber: string | null;
  rcNumber: string | null;
  notes: string | null;
  archived: boolean;
}

export interface ThirdPartyInput {
  kind: ThirdPartyKind;
  entityType?: EntityType;
  name: string;
  email?: string | null;
  phone?: string | null;
  vatNumber?: string | null;
  rcNumber?: string | null;
  notes?: string | null;
  addressLine2?: string | null;
  street?: string | null;
  buildingNumber?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
}

/** Number of documents referencing a third party — decides if it is deletable. */
export interface ThirdPartyUsage {
  invoices: number;
  quotes: number;
  contracts: number;
}

// ───────────────────────────── Bank details ─────────────────────────────

export interface BankAccount {
  id: string;
  companyId: string;
  label: string;
  /** IBAN without spaces. */
  iban: string;
  holderName: string | null;
  bankName: string | null;
  bic: string | null;
  currency: string;
  isDefault: boolean;
  archived: boolean;
}

export interface BankAccountInput {
  label: string;
  iban: string;
  holderName?: string | null;
  bankName?: string | null;
  bic?: string | null;
  currency?: string;
  isDefault?: boolean;
}

// ───────────────────────────── Chart of accounts ─────────────────────────────

export type AccountKind = "product" | "expense" | "asset" | "liability" | "equity";

export interface AccountCategory {
  id: string;
  companyId: string;
  code: string;
  label: string;
  kind: AccountKind;
  defaultVatCode: string | null;
  isInvestment: boolean;
  sortOrder: number;
  archived: boolean;
}

export interface AccountCategoryInput {
  code: string;
  label: string;
  kind: AccountKind;
  defaultVatCode?: string | null;
  isInvestment?: boolean;
}

// ───────────────────────────── Invoices ─────────────────────────────

export type InvoiceKind = "sale" | "purchase";
export type VatTreatment =
  | "standard"
  | "exempt_export"
  | "foreign"
  | "excluded"
  | "discount"
  | "input_material"
  | "input_investment"
  | "subsidy"
  | "donation";
export type RateType = "normal" | "reduced" | "lodging" | "zero";
export type InvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "partial"
  | "overdue"
  | "settled_vat";
export type EnteredAs = "ht" | "ttc";

export interface Invoice {
  id: string;
  companyId: string;
  type: InvoiceKind;
  number: string | null;
  issueDate: string;
  dueDate: string | null;
  thirdPartyId: string | null;
  description: string | null;
  categoryId: string | null;
  treatment: VatTreatment;
  enteredAs: EnteredAs;
  amountHt: number;
  vatRateBps: number;
  vatAmount: number;
  vatAmountOverride: number | null;
  amountTtc: number;
  currency: string;
  fxRate: number | null;
  amountChf: number;
  vatCode: string | null;
  vatCodeOverride: boolean;
  status: InvoiceStatus;
  paymentDate: string | null;
  notes: string | null;
  /** Subject printed after the number on the issued invoice. */
  title: string | null;
  quoteId: string | null;
  contractId: string | null;
  bankAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Invoice entry from the UI. The server recomputes the derived amounts. */
export interface InvoiceInput {
  type: InvoiceKind;
  number?: string | null;
  issueDate: string;
  dueDate?: string | null;
  thirdPartyId?: string | null;
  description?: string | null;
  categoryId?: string | null;
  treatment: VatTreatment;
  rate: RateType;
  enteredAs: EnteredAs;
  /** Amount entered, in cents. */
  enteredAmount: number;
  /** Actual VAT entered (cents); overrides the auto calculation. null = auto. */
  vatAmountOverride?: number | null;
  currency?: string;
  fxRate?: number | null;
  /** VAT code forced manually (otherwise derived). */
  vatCodeOverride?: string | null;
  status?: InvoiceStatus;
  paymentDate?: string | null;
  notes?: string | null;
  title?: string | null;
  quoteId?: string | null;
  contractId?: string | null;
  bankAccountId?: string | null;
}

export interface InvoiceFilters {
  type?: InvoiceKind;
  status?: InvoiceStatus;
  thirdPartyId?: string;
  vatCode?: string;
  /** Date bounds (issueDate), inclusive. */
  from?: string;
  to?: string;
  /**
   * Stackable issue-date ranges (combined with OR), for the quick filters by
   * VAT period (Q1..Q4 / S1..S2 / year). Additive to the other filters.
   */
  issueRanges?: { from: string; to: string }[];
  /** Full-text search (number, description, third party). */
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "issueDate" | "amountTtc" | "number" | "status";
  sortDir?: "asc" | "desc";
}

export interface InvoiceListResult {
  rows: Invoice[];
  total: number;
}

export interface InvoicePayment {
  id: string;
  companyId: string;
  invoiceId: string;
  date: string;
  amount: number;
}

/** Attachment of an invoice (link to a file, not copied). */
export interface InvoiceAttachment {
  id: string;
  companyId: string;
  invoiceId: string;
  /** Absolute path of the original file (reference, no copy). */
  filePath: string;
  originalName: string;
  mime: string | null;
  size: number | null;
  hash: string | null;
}

// ───────────────────────────── Quotes ─────────────────────────────

/**
 * Life cycle of a quote.
 * `invoiced` is terminal: the quote has produced one or more invoices.
 */
export type QuoteStatus = "draft" | "sent" | "accepted" | "refused" | "expired" | "invoiced";

export type DocumentLineKind = "section" | "item" | "detail";

/** Persisted line of a quote or an invoice. */
export interface DocumentLineRecord {
  id: string;
  kind: DocumentLineKind;
  label: string;
  /** Quantity ×1000 (1 = 1000). */
  qtyMilli: number;
  unitPriceHt: number;
  vatRateBps: number;
}

/** Line as entered in the UI (without identifier). */
export type DocumentLineInput = Omit<DocumentLineRecord, "id">;

export interface Quote {
  id: string;
  companyId: string;
  number: string;
  issueDate: string;
  validUntil: string | null;
  thirdPartyId: string | null;
  title: string | null;
  status: QuoteStatus;
  currency: string;
  amountHt: number;
  vatAmount: number;
  amountTtc: number;
  vatNote: string | null;
  notes: string | null;
  bankAccountId: string | null;
  acceptedAt: string | null;
  /** Invoice produced by the conversion, if the quote has been invoiced. */
  invoiceId: string | null;
  contractId: string | null;
  /** Revised quote replacing this one; the original is then not "lost". */
  supersededByQuoteId: string | null;
  /** Provider signature printed: null = the default one, "none" = blank line. */
  signatureId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteWithLines extends Quote {
  lines: DocumentLineRecord[];
}

export interface QuoteInput {
  /** Left empty on creation: the DC… number is assigned automatically. */
  number?: string | null;
  issueDate: string;
  validUntil?: string | null;
  thirdPartyId?: string | null;
  title?: string | null;
  status?: QuoteStatus;
  currency?: string;
  vatNote?: string | null;
  notes?: string | null;
  bankAccountId?: string | null;
  signatureId?: string | null;
  lines: DocumentLineInput[];
}

export interface QuoteFilters {
  status?: QuoteStatus;
  thirdPartyId?: string;
  from?: string;
  to?: string;
  search?: string;
}

// ───────────────────────────── Contracts ─────────────────────────────

export type ContractStatus = "draft" | "sent" | "signed" | "terminated";

/** Section of a contract (clause, list, table, signatures…). */
export type { ContractBlock } from "./documents/contract-blocks.js";
import type { ContractBlock } from "./documents/contract-blocks.js";

export interface Contract {
  id: string;
  companyId: string;
  number: string;
  thirdPartyId: string | null;
  quoteId: string | null;
  title: string | null;
  status: ContractStatus;
  issueDate: string;
  startDate: string | null;
  endDate: string | null;
  minDurationMonths: number | null;
  noticeDays: number | null;
  /** One-off service lines of the quote (site creation…), in net cents. */
  oneOffAmountHt: number | null;
  monthlyAmountHt: number | null;
  vatRateBps: number;
  blocks: ContractBlock[];
  signedDate: string | null;
  signedPlace: string | null;
  terminatedDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractInput {
  number?: string | null;
  thirdPartyId?: string | null;
  quoteId?: string | null;
  title?: string | null;
  status?: ContractStatus;
  issueDate: string;
  startDate?: string | null;
  endDate?: string | null;
  minDurationMonths?: number | null;
  noticeDays?: number | null;
  oneOffAmountHt?: number | null;
  monthlyAmountHt?: number | null;
  vatRateBps?: number;
  blocks: ContractBlock[];
  signedDate?: string | null;
  signedPlace?: string | null;
  terminatedDate?: string | null;
  notes?: string | null;
}

export interface ContractTemplate {
  id: string;
  companyId: string;
  name: string;
  blocks: ContractBlock[];
  isDefault: boolean;
}

// ───────────────────────────── Backup / export ─────────────────────────────

/** Complete data bundle of a company (for export/import). */
export interface CompanyBundle {
  company: Record<string, unknown>;
  vatSettings: Record<string, unknown> | null;
  brandSettings: Record<string, unknown> | null;
  legalFormHistory: Record<string, unknown>[];
  companyVatRates: Record<string, unknown>[];
  tdfnRates: Record<string, unknown>[];
  fiscalYears: Record<string, unknown>[];
  thirdParties: Record<string, unknown>[];
  accountCategories: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  invoicePayments: Record<string, unknown>[];
  invoiceAttachments: Record<string, unknown>[];
  recurringInvoices: Record<string, unknown>[];
  bankAccounts: Record<string, unknown>[];
  quotes: Record<string, unknown>[];
  documentLines: Record<string, unknown>[];
  contracts: Record<string, unknown>[];
  contractTemplates: Record<string, unknown>[];
  vatReturns: Record<string, unknown>[];
  vatReturnLines: Record<string, unknown>[];
  associates: Record<string, unknown>[];
  fundContributions: Record<string, unknown>[];
  cashReconciliations: Record<string, unknown>[];
  objectives: Record<string, unknown>[];
  dashboards: Record<string, unknown>[];
  companyEquity: Record<string, unknown> | null;
  equityAccounts: Record<string, unknown>[];
  distributions: Record<string, unknown>[];
  /** Shareholder signatures (v1.20.0). Absent from older backups. */
  signatures?: Record<string, unknown>[];
}

export interface BackupFile {
  format: "qompta-backup";
  version: number;
  exportedAt: string;
  scope: "all" | "company";
  companies: CompanyBundle[];
}

// ───────────────────────────── VAT return ─────────────────────────────

export type VatReturnStatus = "in_progress" | "closed" | "filed" | "paid";

/** Identifier of a period (company + type + year + index). */
export interface PeriodSelector {
  companyId: string;
  periodType: PeriodType;
  year: number;
  periodIndex?: number | null;
}

/** Persistent record of a closed VAT return. */
export interface VatReturnRecord {
  id: string;
  companyId: string;
  periodType: PeriodType;
  year: number;
  periodIndex: number | null;
  startDate: string;
  endDate: string;
  method: VatMethod;
  status: VatReturnStatus;
  locked: boolean;
  totalPayable: number | null;
  totalCredit: number | null;
  filedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}
