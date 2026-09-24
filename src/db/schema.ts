/**
 * SQLite database schema (Drizzle ORM).
 * See docs/DATA-MODEL.md. Amounts in cents (INTEGER), dates as ISO TEXT.
 * `company_id` is present on every business table (strict isolation).
 */

import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// ───────────────────────────── Multi-company core ──────────────────────────────

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  legalForm: text("legal_form").notNull(),
  ideNumber: text("ide_number"),
  vatNumber: text("vat_number"),
  rcRegistered: integer("rc_registered", { mode: "boolean" }).notNull().default(false),
  addressJson: text("address_json"),
  // ── Details printed on quotes, invoices and contracts ──
  /** Commercial register number (e.g. CH-036-1107245-4). */
  rcNumber: text("rc_number"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  /** Street without the number (the QR-bill requires street and number apart). */
  street: text("street"),
  buildingNumber: text("building_number"),
  zip: text("zip"),
  city: text("city"),
  country: text("country").notNull().default("CH"),
  /** Logo text in Inter Black (default: the company name). */
  logoText: text("logo_text"),
  accountingMode: text("accounting_mode").notNull().default("simple"),
  shareCapital: integer("share_capital"),
  defaultCurrency: text("default_currency").notNull().default("CHF"),
  color: text("color"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
  archivedAt: text("archived_at"),
});

export const companyLegalFormHistory = sqliteTable("company_legal_form_history", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  fromForm: text("from_form"),
  toForm: text("to_form").notNull(),
  effectiveDate: text("effective_date").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(now),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ───────────────────────────── Settings & VAT ─────────────────────────────

export const companyVatSettings = sqliteTable("company_vat_settings", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  isVatSubject: integer("is_vat_subject", { mode: "boolean" }).notNull().default(true),
  periodType: text("period_type").notNull().default("quarterly"),
  method: text("method").notNull().default("effective"),
  accountingBasis: text("accounting_basis").notNull().default("agreed"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

/**
 * PDF document branding, per company (see src/shared/brand.ts).
 * No row = original QWASAR template: the defaults here reproduce the historical
 * rendering, so an existing company has nothing to do.
 */
export const companyBrandSettings = sqliteTable("company_brand_settings", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  /** text | image | none */
  logoMode: text("logo_mode").notNull().default("text"),
  /** Logo as a data-URI (image mode): it must travel with the backup. */
  logoImage: text("logo_image"),
  /** Logo height in tenths of a mm (105 = 10.5 mm, original size). */
  logoHeightDmm: integer("logo_height_dmm").notNull().default(105),
  showContact: integer("show_contact", { mode: "boolean" }).notNull().default(true),
  /** letters | none */
  patternMode: text("pattern_mode").notNull().default("letters"),
  patternText: text("pattern_text").notNull().default("Q"),
  /** Pattern columns (1 to 5): also drives the document's right margin. */
  patternColumns: integer("pattern_columns").notNull().default(3),
  patternOpacityPct: integer("pattern_opacity_pct").notNull().default(40),
  patternSizeDmm: integer("pattern_size_dmm").notNull().default(42),
  showQuoteSignatures: integer("show_quote_signatures", { mode: "boolean" })
    .notNull()
    .default(true),
  // ── Document font ──
  /** inter (default) | custom (embedded files) | system (machine font) */
  fontMode: text("font_mode").notNull().default("inter"),
  /** System font name (system mode). */
  fontFamily: text("font_family").notNull().default(""),
  /**
   * Embedded weights (custom mode): [{ weight, style, data, name }], the font
   * as a data-URI. Bulky but essential — the PDF must print identically on any
   * machine, so the font travels with the backup.
   */
  fontFacesJson: text("font_faces_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const vatRateDefaults = sqliteTable("vat_rate_defaults", {
  id: text("id").primaryKey(),
  rateType: text("rate_type").notNull(),
  valueBps: integer("value_bps").notNull(),
  validFrom: text("valid_from").notNull(),
  validTo: text("valid_to"),
});

export const companyVatRates = sqliteTable("company_vat_rates", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  rateType: text("rate_type").notNull(),
  valueBps: integer("value_bps").notNull(),
  validFrom: text("valid_from").notNull(),
  validTo: text("valid_to"),
});

export const tdfnRates = sqliteTable("tdfn_rates", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  valueBps: integer("value_bps").notNull(),
  validFrom: text("valid_from").notNull(),
  validTo: text("valid_to"),
});

// ────────────────────────── Financial years ──────────────────────────

export const fiscalYears = sqliteTable("fiscal_years", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("open"),
});

// ─────────────────────── Third parties & chart of accounts ────────────────────────

export const thirdParties = sqliteTable("third_parties", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("both"),
  /**
   * company | person — a partner is a customer company under contract, never a
   * natural person. Default "company": in B2B that is the common case, and the
   * existing records are companies.
   */
  entityType: text("entity_type").notNull().default("company"),
  name: text("name").notNull(),
  addressJson: text("address_json"),
  email: text("email"),
  phone: text("phone"),
  vatNumber: text("vat_number"),
  notes: text("notes"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  // ── Structured address: printed on documents and required by the QR-bill ──
  /** Extra line shown under the name (e.g. « titulaire Umahara »). */
  addressLine2: text("address_line2"),
  street: text("street"),
  buildingNumber: text("building_number"),
  zip: text("zip"),
  city: text("city"),
  country: text("country").notNull().default("CH"),
  /** The third party's commercial register number. */
  rcNumber: text("rc_number"),
});

// ───────────────────────────────── Bank accounts ─────────────────────────────────

/**
 * Bank accounts of a company. The account carried by an invoice feeds the QR
 * payment part; `isDefault` provides the value proposed on creation.
 */
export const bankAccounts = sqliteTable("bank_accounts", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  /** IBAN without spaces. A QR-IBAN requires a QR reference on the invoice. */
  iban: text("iban").notNull(),
  /** Holder name when it differs from the company name. */
  holderName: text("holder_name"),
  bankName: text("bank_name"),
  bic: text("bic"),
  currency: text("currency").notNull().default("CHF"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now),
});

export const accountCategories = sqliteTable("account_categories", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  kind: text("kind").notNull(),
  defaultVatCode: text("default_vat_code"),
  defaultPrepaidInput: text("default_prepaid_input"),
  isInvestment: integer("is_investment", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

// ───────────────────────────── Invoices ─────────────────────────────

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  number: text("number"),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date"),
  thirdPartyId: text("third_party_id").references(() => thirdParties.id),
  description: text("description"),
  categoryId: text("category_id").references(() => accountCategories.id),
  treatment: text("treatment").notNull().default("standard"),
  enteredAs: text("entered_as").notNull().default("ttc"),
  amountHt: integer("amount_ht").notNull().default(0),
  vatRateBps: integer("vat_rate_bps").notNull().default(0),
  vatAmount: integer("vat_amount").notNull().default(0),
  /** Manually entered VAT (wins over the auto calculation); null = automatic. */
  vatAmountOverride: integer("vat_amount_override"),
  amountTtc: integer("amount_ttc").notNull().default(0),
  currency: text("currency").notNull().default("CHF"),
  fxRate: integer("fx_rate"),
  amountChf: integer("amount_chf").notNull().default(0),
  vatCode: text("vat_code"),
  vatCodeOverride: integer("vat_code_override", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("draft"),
  paymentDate: text("payment_date"),
  recurringId: text("recurring_id"),
  notes: text("notes"),
  // ── Detailed invoicing (issued documents) ──
  /** Invoice subject, printed after the number. */
  title: text("title"),
  /** Quote the invoice originates from, when applicable. */
  quoteId: text("quote_id"),
  /** Contract the invoice derives from (subscriptions). */
  contractId: text("contract_id"),
  /** Bank account carried by the QR-bill. */
  bankAccountId: text("bank_account_id"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const invoicePayments = sqliteTable("invoice_payments", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  amount: integer("amount").notNull(),
});

export const invoiceAttachments = sqliteTable("invoice_attachments", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  originalName: text("original_name").notNull(),
  mime: text("mime"),
  size: integer("size"),
  hash: text("hash"),
});

export const recurringInvoices = sqliteTable("recurring_invoices", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  templateJson: text("template_json").notNull(),
  frequency: text("frequency").notNull(),
  nextDate: text("next_date").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// ──────────────────────────── Quotes ─────────────────────────────

/**
 * Quotes. Deliberately kept apart from `invoices`: a quote is not an accounting
 * entry and must never enter the VAT return. Its conversion is what creates a
 * sales invoice, which then feeds the return normally.
 */
export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  issueDate: text("issue_date").notNull(),
  /** Date the offer stops being valid. */
  validUntil: text("valid_until"),
  thirdPartyId: text("third_party_id").references(() => thirdParties.id),
  /** Quote subject, printed after the number. */
  title: text("title"),
  /** draft | sent | accepted | refused | expired | invoiced */
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull().default("CHF"),
  /** Totals frozen at the last save (recomputed from the lines). */
  amountHt: integer("amount_ht").notNull().default(0),
  vatAmount: integer("vat_amount").notNull().default(0),
  amountTtc: integer("amount_ttc").notNull().default(0),
  /** Note printed under the tables. */
  vatNote: text("vat_note"),
  notes: text("notes"),
  bankAccountId: text("bank_account_id").references(() => bankAccounts.id),
  /** Filled in on acceptance, then on conversion. */
  acceptedAt: text("accepted_at"),
  invoiceId: text("invoice_id"),
  contractId: text("contract_id"),
  /**
   * Quote that replaces this one (offer adapted after refusal or expiry).
   * A quote taken over this way does not count as a lost deal: the adapted
   * version now carries the opportunity.
   */
  supersededByQuoteId: text("superseded_by_quote_id"),
  /**
   * Provider signature printed at the bottom of the quote (table `signatures`).
   * Deliberately without a foreign key: deleting a signature must neither block
   * nor rewrite a quote — the PDF then falls back on the default signature.
   */
  signatureId: text("signature_id"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

/**
 * Lines of a commercial document (quote or invoice), in printing order.
 *
 * `kind` is one of:
 *  - `section` : opens a new table, `label` acts as an introduction note;
 *  - `item`    : billable service line (quantity × net unit price);
 *  - `detail`  : service line included, printed with a dash.
 */
export const documentLines = sqliteTable("document_lines", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  /** quote | invoice */
  documentType: text("document_type").notNull(),
  documentId: text("document_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  kind: text("kind").notNull().default("item"),
  label: text("label").notNull(),
  /** Quantity ×1000 (1 = 1000) to handle fractions without floats. */
  qtyMilli: integer("qty_milli").notNull().default(1000),
  /** Net unit price in cents. */
  unitPriceHt: integer("unit_price_ht").notNull().default(0),
  vatRateBps: integer("vat_rate_bps").notNull().default(0),
});

// ──────────────────────────── Contracts ─────────────────────────────

/**
 * Service contract, usually issued from an accepted quote.
 * The articles are frozen (`articlesJson`) on creation: a signed contract must
 * not change because the template has evolved since.
 */
export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  thirdPartyId: text("third_party_id").references(() => thirdParties.id),
  /** Quote the contract originates from. */
  quoteId: text("quote_id"),
  title: text("title"),
  /** draft | sent | signed | terminated */
  status: text("status").notNull().default("draft"),
  issueDate: text("issue_date").notNull(),
  /** Start of the recurring service lines. */
  startDate: text("start_date"),
  endDate: text("end_date"),
  /** Minimum commitment duration, in months. */
  minDurationMonths: integer("min_duration_months"),
  /** Termination notice, in days. */
  noticeDays: integer("notice_days"),
  /**
   * One-off net amount in cents: the non-recurring service lines of the quote
   * (website creation…). The contract guarantees their payment just like the
   * subscription.
   */
  oneOffAmountHt: integer("one_off_amount_ht"),
  /** Recurring net amount in cents (subscription). */
  monthlyAmountHt: integer("monthly_amount_ht"),
  vatRateBps: integer("vat_rate_bps").notNull().default(0),
  /** Frozen articles: [{ title, body }]. */
  articlesJson: text("articles_json").notNull().default("[]"),
  signedDate: text("signed_date"),
  signedPlace: text("signed_place"),
  terminatedDate: text("terminated_date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

/** Reusable article templates used to generate a contract. */
export const contractTemplates = sqliteTable("contract_templates", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Articles with variables: [{ title, body }]. */
  articlesJson: text("articles_json").notNull().default("[]"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now),
});

// ────────────────────────────── VAT return ──────────────────────────────

export const vatReturns = sqliteTable("vat_returns", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  periodType: text("period_type").notNull(),
  year: integer("year").notNull(),
  periodIndex: integer("period_index"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  method: text("method").notNull().default("effective"),
  status: text("status").notNull().default("in_progress"),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  totalPayable: integer("total_payable"),
  totalCredit: integer("total_credit"),
  filedAt: text("filed_at"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const vatReturnLines = sqliteTable("vat_return_lines", {
  id: text("id").primaryKey(),
  vatReturnId: text("vat_return_id")
    .notNull()
    .references(() => vatReturns.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  baseAmount: integer("base_amount").notNull().default(0),
  taxAmount: integer("tax_amount"),
});

// ─────────────────────────── Shareholders & capital ───────────────────────────

export const associates = sqliteTable("associates", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shareBps: integer("share_bps").notNull(),
  role: text("role"),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date"),
});

/**
 * Handwritten signatures (image) of the people who sign for the company,
 * printed at the bottom of quotes and in the "Signatures" section of contracts.
 *
 * Attached to a shareholder: they are the one who signs. `name` and `role` are
 * frozen on entry (editable) — a shareholder leaving does not erase their signature
 * from documents already issued. The image is a data-URI (usually a transparent PNG).
 */
export const signatures = sqliteTable("signatures", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  associateId: text("associate_id").references(() => associates.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role"),
  image: text("image").notNull(),
  /** Signature proposed by default on new quotes and contracts. */
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

/**
 * Fund contributions: money paid into the company by a shareholder.
 *
 * This is NOT revenue: a contribution creates no turnover and stays outside the
 * scope of VAT — hence a separate table, which no VAT return calculation reads.
 * It only feeds the cash position (paying the first invoices) and, depending on
 * `kind`, the equity or the debt owed to the shareholder.
 *
 * `kind` is one of:
 *  - `capital`         : capital / equity contribution, not repayable;
 *  - `current_account` : shareholder loan account advance, repayable;
 *  - `repayment`       : repayment to the shareholder (outflow), positive amount
 *                        as well, counted as negative in the totals.
 */
export const fundContributions = sqliteTable("fund_contributions", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  /** Shareholder behind the payment. `set null`: history survives their exit. */
  associateId: text("associate_id").references(() => associates.id, { onDelete: "set null" }),
  /** Name frozen on entry, so it stays readable if the shareholder disappears. */
  associateName: text("associate_name").notNull(),
  date: text("date").notNull(),
  /** capital | current_account | repayment */
  kind: text("kind").notNull().default("current_account"),
  /** Amount in cents, always positive (the direction comes from `kind`). */
  amount: integer("amount").notNull().default(0),
  /** bank | cash */
  method: text("method").notNull().default("bank"),
  bankAccountId: text("bank_account_id").references(() => bankAccounts.id),
  /** Transfer label, voucher number… */
  reference: text("reference"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
});

/**
 * Cash reconciliations: the actual balance observed on a date. Realigns the
 * displayed cash position on the bank account (private withdrawals, cash,
 * unrecorded differences…). Outside the VAT return and outside the result.
 */
export const cashReconciliations = sqliteTable("cash_reconciliations", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  /** Actual balance observed on that date, in cents (signed). */
  balance: integer("balance").notNull().default(0),
  note: text("note"),
  createdAt: text("created_at").notNull().default(now),
});

export const equityAccounts = sqliteTable("equity_accounts", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  balance: integer("balance").notNull().default(0),
});

export const distributions = sqliteTable("distributions", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  fiscalYearId: text("fiscal_year_id").references(() => fiscalYears.id),
  beneficiary: text("beneficiary").notNull(),
  kind: text("kind").notNull(),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
});

// ────────────────────────────── Targets ──────────────────────────────

/**
 * Numeric target set on a management metric, for a period. Isolated per company.
 * The metric (`metric`) is a key of the `src/shared/objectives` catalogue; the
 * target (`target_value`) is in cents, in units or in basis points depending on
 * the metric's unit. `direction` says whether we aim at a floor (`at_least`, e.g.
 * turnover) or a ceiling (`at_most`, e.g. expenses). Actual progress is never
 * stored: it is recomputed from the data on every display.
 */
export const objectives = sqliteTable("objectives", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  /** year | quarter | month */
  periodType: text("period_type").notNull().default("year"),
  periodYear: integer("period_year").notNull(),
  /** 1..4 for a quarter, null otherwise. */
  periodQuarter: integer("period_quarter"),
  /** 1..12 for a month, null otherwise. */
  periodMonth: integer("period_month"),
  targetValue: integer("target_value").notNull(),
  /** at_least | at_most */
  direction: text("direction").notNull().default("at_least"),
  /** Optional custom label, otherwise the catalogue one. */
  label: text("label"),
  createdAt: text("created_at").notNull().default(now),
});

/**
 * Equity entered for a Sàrl/SA (one row per company): feeds the "profit +
 * capital" tax file. Amounts in cents.
 */
export const companyEquity = sqliteTable("company_equity", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  shareCapital: integer("share_capital").notNull().default(0),
  reserves: integer("reserves").notNull().default(0),
  retainedEarnings: integer("retained_earnings").notNull().default(0),
  nonDeductibleCharges: integer("non_deductible_charges").notNull().default(0),
  managerSalary: integer("manager_salary").notNull().default(0),
  dividends: integer("dividends").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(now),
});

/**
 * Customisable dashboards: each company has several dashboards, each carrying a
 * list of widgets (KPI/chart) serialised as JSON.
 */
export const dashboards = sqliteTable("dashboards", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  /** Widgets serialised as JSON: [{ id, kind, metric?, chart?, width }]. */
  widgets: text("widgets").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(now),
});

// ───────────────────────────── Audit ─────────────────────────────

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  companyId: text("company_id"),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  diffJson: text("diff_json"),
  at: text("at").notNull().default(now),
});

// Composite-key helper table example (kept for future tagging needs)
export const _schemaMeta = sqliteTable(
  "_schema_meta",
  {
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    value: text("value").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.key, t.scope] }) }),
);
