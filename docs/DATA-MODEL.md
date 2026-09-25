# Qompta data model

Convention: every amount is stored in **cents (INTEGER)**. Dates are ISO `TEXT`
`YYYY-MM-DD`. `company_id` is present on **every** business table. Primary keys are
named `id` (TEXT/UUID or INTEGER autoincrement; UUID chosen to ease import/export).

Legend: 🌐 = global table (no `company_id`).

---

## Multi-company core

### `companies` 🌐
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | Registered company name |
| legal_form | TEXT | `raison_individuelle` \| `societe_simple` \| `snc` \| `sarl` \| `sa` \| `association` |
| ide_number | TEXT? | `CHE-123.456.789` |
| vat_number | TEXT? | `CHE-123.456.789 TVA` |
| rc_registered | INTEGER | bool: listed in the commercial register |
| address_json | TEXT? | structured address (JSON) |
| accounting_mode | TEXT | `simple` (receipts/payments) \| `double` |
| share_capital | INTEGER? | share capital (Sàrl/SA), in cents |
| default_currency | TEXT | `CHF` |
| color | TEXT? | badge color in the company picker |
| status | TEXT | `active` \| `archived` |
| created_at / updated_at | TEXT | ISO datetime |
| archived_at | TEXT? | |

### `company_legal_form_history` (log of legal form changes)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| from_form | TEXT? | null for the initial form |
| to_form | TEXT | new legal form |
| effective_date | TEXT | effective date |
| note | TEXT? | |
| created_at | TEXT | |

> How to read it: for a given date, the applicable legal form = the last entry whose
> `effective_date <= date`. Earlier history stays viewable under the former legal form.

### `app_settings` 🌐
| Column | Type | Notes |
|---|---|---|
| key | TEXT PK | e.g. `active_company_id`, `theme`, `schema_version` |
| value | TEXT | JSON |

> Notable keys: `backup:dir`, `backup:retentionDays`, `backup:last`,
> `backup:lastError` (automatic backups), and the per-company version flag for
> dashboard templates (new templates are added exactly once).

---

## Settings & VAT per company

### `company_vat_settings`
| Column | Type | Notes |
|---|---|---|
| company_id | TEXT PK/FK | 1–1 with the company |
| is_vat_subject | INTEGER | bool: if false, the whole VAT module is hidden |
| period_type | TEXT | `quarterly` (default) \| `semestrial` \| `annual` |
| method | TEXT | `effective` (default) \| `tdfn` (net tax debt rate) |
| accounting_basis | TEXT | `agreed` (accrual = invoice date, default) \| `received` (cash = payment date) |
| created_at / updated_at | TEXT | |

### `company_brand_settings` (PDF branding, per company)
No row = the original QWASAR template. The defaults below **reproduce the historical
output**: an existing company needs no action. Lengths in **tenths of a mm**.

| Column | Type | Notes |
|---|---|---|
| company_id | TEXT PK FK | cascade |
| logo_mode | TEXT | `text` (default) \| `image` \| `none` |
| logo_image | TEXT? | data URI; travels with the backup, prints offline |
| logo_height_dmm | INTEGER | 105 = 10.5 mm (original size) |
| show_contact | INTEGER | email line below the logo |
| pattern_mode | TEXT | `letters` (default) \| `none` |
| pattern_text | TEXT | « Q » by default, 3 characters maximum |
| pattern_columns | INTEGER | 1 to 5 (3 = QWASAR template); **also shifts the document's right margin** |
| pattern_opacity_pct | INTEGER | 40 |
| pattern_size_dmm | INTEGER | 42 = 4.2 mm; the step follows the size (5.1/4.2 ratio) |
| show_quote_signatures | INTEGER | signature blocks at the bottom of quotes |
| font_mode | TEXT | `inter` (default) \| `custom` (embedded files) \| `system` (machine font) |
| font_family | TEXT | system font name (`system` mode) |
| font_faces_json | TEXT | embedded weights: `[{ weight, style, data, name }]`, font as a data URI |

Bounds and safeguards (image data URI only, capped values):
`src/shared/brand.ts`.

**Font.** Inter is embedded in the application: identical output everywhere, offline.
A `custom` font follows the same path: the files are stored in the database and go
back out with every PDF, so the backup carries them along. A `system` font is only
**named**: it depends on the machine generating the document and falls back to Inter
if missing. Inter always stays second in the `font-family` chain, so that a missing
weight never makes the document fall back to the operating system's default font.

The number of columns is not merely decorative: the band occupies the right edge of
the sheet and the text column is aligned just to its left. Adding a column narrows
the text by exactly one column width (4.33 mm), removing one gives the space back,
up to a right margin equal to the left margin. `contentRightMm` /
`contentRightMarginMm` (theme.ts) are the single source of this value: the page
padding, the repeated header and the QR-bill's negative margin all derive from it,
otherwise the payment part would no longer be 210 mm and would be scaled, hence
non-compliant.

### `vat_rate_defaults` 🌐
Official rates with history (used as the baseline; a company may override them).
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| rate_type | TEXT | `normal` \| `reduced` \| `lodging` |
| value_bps | INTEGER | rate in basis points (8.10 % = 810) |
| valid_from | TEXT | date |
| valid_to | TEXT? | null = currently in force |

> 2026: normal 810, reduced 260, lodging 380.

### `company_vat_rates` (optional per-company override, same structure + company_id)
Allows freezing the rates of past periods. Otherwise `vat_rate_defaults` is read.

### `tdfn_rates` (net tax debt rates, per company + business sector)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| label | TEXT | line of business |
| value_bps | INTEGER | FTA flat rate |
| valid_from / valid_to | TEXT | |

---

## Financial years

### `fiscal_years`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| label | TEXT | e.g. « 2026 » |
| start_date / end_date | TEXT | |
| status | TEXT | `open` \| `closed` |

---

## Third parties & chart of accounts

### `third_parties` (address book per company)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| kind | TEXT | `client` \| `supplier` \| `both` |
| entity_type | TEXT | `company` (default) \| `person` (a **partner** is a customer company under contract) |
| name | TEXT | |
| address_json | TEXT? | |
| email / phone | TEXT? | |
| vat_number | TEXT? | |
| notes | TEXT? | |
| archived | INTEGER | bool |

### `account_categories` (chart of accounts, tailored to the legal form)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| code | TEXT | account no. (based on the Sterchi SME chart) |
| label | TEXT | |
| kind | TEXT | `product` \| `expense` \| `asset` \| `liability` \| `equity` |
| default_vat_code | TEXT? | default mapping to a VAT return code (303/400/405…) |
| default_prepaid_input | TEXT? | `400` \| `405` for expenses |
| is_investment | INTEGER | bool: routes to 405 |
| sort_order | INTEGER | |
| archived | INTEGER | bool |

---

## Invoices

### `invoices`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | auto = active company |
| type | TEXT | `sale` \| `purchase` |
| number | TEXT? | invoice no. |
| issue_date | TEXT | invoice date |
| due_date | TEXT? | due date |
| third_party_id | TEXT? FK | customer or supplier |
| description | TEXT? | |
| category_id | TEXT? FK | accounting category |
| entered_as | TEXT | `ht` \| `ttc`: how the user entered it (net / gross) |
| amount_ht | INTEGER | computed net amount, cents |
| vat_rate_bps | INTEGER | applied rate (810/260/380/0) |
| vat_amount | INTEGER | computed |
| amount_ttc | INTEGER | computed gross amount |
| currency | TEXT | `CHF` by default |
| fx_rate | INTEGER? | conversion rate ×10000 if currency ≠ CHF |
| amount_chf | INTEGER | amount converted to CHF for the VAT return |
| vat_code | TEXT | VAT return code (200/303/313/343/220/221/230/235/400/405/900/910…) |
| vat_code_override | INTEGER | bool: true if forced manually |
| status | TEXT | `draft` \| `issued` \| `paid` \| `partial` \| `overdue` |
| payment_date | TEXT? | |
| recurring_id | TEXT? FK | if generated from a recurring template |
| notes | TEXT? | |
| created_at / updated_at | TEXT | |

### `invoice_payments` (partial payments)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| invoice_id | TEXT FK | |
| date | TEXT | |
| amount | INTEGER | cents |

### `invoice_attachments`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| invoice_id | TEXT FK | |
| file_path | TEXT | relative to userData/attachments |
| original_name | TEXT | |
| mime / size / hash | TEXT/INT | |

### `recurring_invoices` (recurring templates)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| template_json | TEXT | invoice template |
| frequency | TEXT | `monthly` \| `quarterly` \| `yearly` |
| next_date | TEXT | next generation |
| active | INTEGER | bool |

---

## VAT return

### `vat_returns` (one return = company + period)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| period_type | TEXT | `quarterly` \| `semestrial` \| `annual` |
| year | INTEGER | |
| period_index | INTEGER? | quarter 1–4 / half-year 1–2 |
| start_date / end_date | TEXT | |
| method | TEXT | `effective` \| `tdfn` (frozen at closing) |
| status | TEXT | `in_progress` \| `closed` \| `filed` \| `paid` |
| locked | INTEGER | bool: period locked |
| total_payable | INTEGER? | code 500 (snapshot) |
| total_credit | INTEGER? | code 510 (snapshot) |
| filed_at / paid_at | TEXT? | |
| created_at / updated_at | TEXT | |

### `vat_return_lines` (snapshot of the codes at closing time)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| vat_return_id | TEXT FK | |
| code | TEXT | `200`,`205`,`220`…`910` |
| base_amount | INTEGER | « Prestations CHF » column (turnover in CHF) |
| tax_amount | INTEGER? | « Impôt CHF » column (tax in CHF, where applicable) |

> As long as a return is `in_progress`, it is **computed on the fly** from the
> invoices. At closing, the lines are **frozen** into `vat_return_lines`.

---

## Shareholders (simple partnership / SNC) & capital (Sàrl)

### `associates`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| name | TEXT | |
| share_bps | INTEGER | share in basis points (50 % = 5000), sum = 10000 |
| role | TEXT? | |
| from_date | TEXT | joined |
| to_date | TEXT? | left |

### `signatures` (handwritten signatures, v1.20.0)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | isolation |
| associate_id | TEXT FK? | signing shareholder, `ON DELETE SET NULL` |
| name, role | TEXT | printed below the signature, frozen at entry time |
| image | TEXT | image data URI only (`safeSignatureImage`) |
| is_default | BOOL | only one per company (enforced by the repository) |

`quotes.signature_id` (no FK): signatory of the quote: `null` = the default one,
`"none"` = a blank line.

### `fund_contributions` (fund contributions: money paid in by a shareholder)
Money the shareholder puts **into** the company to keep it running: initial capital,
cash advance, repayment. **Outside turnover and outside the scope of VAT**: no VAT
return query reads this table. It only feeds the cash position and, depending on
`kind`, equity or the debt owed to the shareholder.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | cascade |
| associate_id | TEXT? FK | `ON DELETE SET NULL`: history survives the shareholder's departure |
| associate_name | TEXT | name frozen at entry time (resynced while the shareholder exists) |
| date | TEXT | payment date |
| kind | TEXT | `capital` (equity) \| `current_account` (repayable advance) \| `repayment` (outflow) |
| amount | INTEGER | cents, **always positive**: the direction comes from `kind` |
| method | TEXT | `bank` \| `cash` |
| bank_account_id | TEXT? FK | credited account (bank transfer only) |
| reference | TEXT? | transfer label, document no. |
| notes | TEXT? | |
| created_at | TEXT | |

Aggregates: `src/shared/funding.ts` (`summarizeFunding`, `buildCashPosition`).
Available cash = net contributions + gross sales collected − gross purchases paid.

### `equity_accounts` (Sàrl: capital, reserves, shareholder loan account)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| kind | TEXT | `share_capital` \| `legal_reserve` \| `voluntary_reserve` \| `partner_current_account` \| `retained_earnings` |
| label | TEXT | |
| balance | INTEGER | cents |

### `distributions` (Sàrl: manager salary / dividends; or shareholder allocation)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT FK | |
| fiscal_year_id | TEXT FK | |
| beneficiary | TEXT | manager/shareholder name |
| kind | TEXT | `salary` \| `dividend` \| `partner_share` |
| amount | INTEGER | cents |
| date | TEXT | |

---

## Audit / log

### `audit_log` 🌐 (optional but useful)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT? | null for a global action |
| entity | TEXT | table concerned |
| entity_id | TEXT | |
| action | TEXT | `create` \| `update` \| `delete` \| `lock` \| `convert_form` |
| diff_json | TEXT? | |
| at | TEXT | |

---

## Commercial documents (quotes, itemized invoices, contracts)

### `bank_accounts`
A company's bank accounts. The one carried by an invoice feeds the QR payment part;
`is_default` provides the value suggested at creation time.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT | isolation |
| label, iban | TEXT | IBAN stored without spaces, check digits validated (zod) |
| holder_name, bank_name, bic | TEXT? | holder if ≠ company name |
| currency | TEXT | `CHF` by default |
| is_default, archived | INT bool | one default account per company |

### `quotes`
**Deliberately separate from `invoices`**: a quote is not an accounting operation and
**never** enters the VAT return. It is its conversion that creates a sales invoice,
which then follows the normal path.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT | isolation |
| number | TEXT | `DC<YYYYMMDD><NN>` series |
| issue_date, valid_until | TEXT | ISO dates |
| third_party_id | TEXT? | customer; their details are reused on the PDF |
| title, vat_note, notes | TEXT? | printed mentions |
| status | TEXT | `draft` \| `sent` \| `accepted` \| `refused` \| `expired` \| `invoiced` |
| amount_ht, vat_amount, amount_ttc | INT | cents, recomputed from the lines |
| bank_account_id | TEXT? | passed on to the invoice created by the conversion |
| accepted_at, invoice_id, contract_id | TEXT? | life-cycle traceability |
| superseded_by_quote_id | TEXT? | revised quote replacing this one; the original then leaves the lost deals on the dashboard |

### `document_lines`
Lines of a quote **or** an invoice (`document_type` = `quote` \| `invoice`),
in printing order.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT | isolation |
| document_type, document_id | TEXT | polymorphic target |
| sort_order | INT | printing order |
| kind | TEXT | `section` (opens a table, label = note) \| `item` (billable) \| `detail` (included, printed with « - ») |
| label | TEXT | Description column |
| qty_milli | INT | quantity ×1000 (1 = 1000), avoids any float |
| unit_price_ht | INT | cents |
| vat_rate_bps | INT | basis points (8.10 % = 810) |

### `contracts` and `contract_templates`
A contract's sections are **frozen** (`articles_json`, variables already resolved) on
save: changing a template never alters a signed contract. Since v1.20.0 they are
**typed sections** (`article`, `heading`, `text`, `list`, `table`, `callout`,
`parties`, `commitments`, `signatures`, `pageBreak`; see
`shared/documents/contract-blocks.ts`); the old `[{ title, body }]` format is still
read (as articles) and prints as before.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company_id | TEXT | isolation |
| number | TEXT | `CC<YYYYMMDD><NN>` series |
| third_party_id, quote_id | TEXT? | quote the contract originates from |
| status | TEXT | `draft` \| `sent` \| `signed` \| `terminated` |
| issue_date, start_date, end_date | TEXT | ISO dates |
| min_duration_months, notice_days | INT? | minimum term, notice period |
| one_off_amount_ht | INT? | one-off service lines from the quote (website build…) |
| monthly_amount_ht, vat_rate_bps | INT? | recurring subscription |

A contract carries **two** amounts: it covers the whole quote, one-off service lines
included, and not just the subscription. When created from a quote, everything
before the first `section` line is one-off, everything after it is recurring.
| articles_json | TEXT | frozen typed sections (old `[{ title, body }]` format accepted) |
| signed_date, signed_place, terminated_date | TEXT? | |

`contract_templates` carries the articles **with** their variables
(`{{montantMensuel}}`, `{{dureeMinimale}}`, `{{preavis}}`, `{{jourEcheance}}`,
`{{interetMoratoire}}`, `{{canton}}`), resolved when a contract is created.

---

## Relationship diagram (summary)

```
companies 1───* invoices *───1 third_parties
   │  │  │           │
   │  │  │           *───1 account_categories
   │  │  │           1───* invoice_payments
   │  │  │           1───* invoice_attachments
   │  │  │           *───1 bank_accounts
   │  │  │           *───1 quotes ──* contracts
   │  │  └──1 company_vat_settings
   │  ├──* company_legal_form_history
   │  ├──* fiscal_years 1───* distributions
   │  ├──* associates 1───* fund_contributions
   │  ├──* equity_accounts
   │  ├──* bank_accounts
   │  ├──* quotes ──* document_lines (document_type = quote)
   │  │      └──1 invoices (conversion)
   │  ├──* contracts *───1 quotes
   │  ├──* contract_templates
   │  └──* vat_returns 1───* vat_return_lines

document_lines *───1 quotes | invoices   (target depends on document_type)
```
