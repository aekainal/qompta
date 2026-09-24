# Task plan — Qompta

Delivered in batches. Every batch ends with a "how to test" section. The foundation
batches (M1) — DB + multi-company + VAT logic with tests — come first, as required by
the specification.

---

## M0 — Architecture & design ✅
- [x] Technical architecture (`ARCHITECTURE.md`)
- [x] Complete data model (`DATA-MODEL.md`)
- [x] VAT logic & FTA codes (`VAT-LOGIC.md`)
- [x] Task plan (this document)

---

## M1 — Foundations: scaffold + DB + multi-company + VAT logic (tests)
**Goal: a testable base without a complete UI.**
- [ ] electron-vite scaffold (main / preload / renderer) + strict TS + Tailwind + shadcn/ui.
- [ ] better-sqlite3 + Drizzle setup + migrations + `db:generate`/`db:migrate`.
- [ ] Table schema (all the tables from `DATA-MODEL.md`).
- [ ] `shared/money.ts` (cents, rounding, net↔gross) + tests.
- [ ] `shared/vat/`: codes, historized rates, mapping, `compute.ts` + **full tests**
  (the 10 cases from `VAT-LOGIC.md`).
- [ ] `shared/legal-form.ts`: rules per legal form (single/double-entry accounting,
  active modules).
- [ ] `companies` + `app_settings` repositories + a **cross-company isolation** test.
- [ ] IPC contract + preload + 1 end-to-end channel (`companies:list`).

**Testing:** `npm test` (green on VAT, money, allocation, isolation); `npm run dev`
opens the app with a minimal company picker.

---

## M2 — Invoices, third parties, chart of accounts  (core delivered ✅, 3 sub-features left)
- [x] Default chart of accounts (Sterchi SME) tailored to the legal form
  (single/double-entry) + editable, installed automatically when the company is created.
- [x] Third-party CRUD (address book per company).
- [x] Invoice form: real-time VAT computation, net/gross entry, currency→CHF, code
  mapping, manual code override.
- [x] Invoice list: filters (period, type, status, third party, code, search), sorting,
  pagination, duplication, deletion.
- [x] Partial payments + statuses (draft/issued/paid/partial/overdue) + automatic
  overdue detection.
- [ ] Attachments (PDF/image) stored locally (table + repository to wire to the file IPC).
- [ ] CSV/Excel import (xlsx already a dependency).
- [ ] Generation of recurring invoices (`recurring_invoices` table already present).

**Tested:** 52/52 tests green (including invoice computation, payments/statuses, M2
isolation). Full build OK. Seed: 4 companies, automatic chart of accounts (17 accounts,
22 for the Sàrl). Remaining: the 3 sub-features above (attachments, CSV import,
recurring invoices).

---

## M3 — VAT return module  ✅ (TDFN UI to be finished)
- [x] Company + period picker; faithful reproduction of the FTA form (all codes).
- [x] On-the-fly computation from the invoices (accrual/cash basis) + warning (379≠299).
- [x] Period closing/locking (`vat_return_lines` snapshot) + reopening.
- [x] Statuses: in progress / closed / filed / paid + history per company.
- [x] PDF export (via printToPDF) + Excel (xlsx) with a save dialog.
- [x] Company not VAT-registered → module hidden.
- [ ] Display tailored to the TDFN method (simplified form) — the TDFN computation is
  already present in `shared/vat/compute.ts`, only the UI remains to be wired.

**Tested:** 63/63 tests (including periods, accrual/cash selection, return building,
closing/snapshot/history). Q1 2026 return of the demo Sàrl verified
(500 = 4 455.00 CHF). Full build OK. PDF/Excel export: code in place, to be tested
in the running app (file dialog).

---

## M4 — Dashboards  ✅
- [x] Company dashboard: KPIs (invoiced/collected turnover, expenses, profit, estimated
  annual VAT), monthly income/expense chart, pie chart of expenses by category,
  unpaid / overdue lists.
- [x] Consolidated multi-company dashboard: totals (turnover, expenses, profit, VAT
  payable), profit per company chart, table per entity with quick access
  (« Ouvrir » — open).

**Tested:** 70/70 tests (including dashboard aggregation). Build OK. Company/Consolidated
toggle + year picker in the « Tableau de bord » (dashboard) tab.

---

## M5 — Tax module (tailored to the legal form) + Shareholders  ✅
- [x] Common base: income statement (income/expenses per category), annual VAT summary
  (output tax, input tax, net due, 900/910), list of investments (405).
- [x] Sole proprietorship: income from self-employment (+ mention of the AVS basis).
- [x] Simple partnership / SNC: **Shareholders** module (shares in %, sum checked
  against 100 %) + automatic allocation of the profit per shareholder.
- [x] Sàrl: taxable profit + equity (share capital + reserves), manager salary vs
  dividends.
- [x] **Legal form conversion** at an effective date (UI in Companies; repository/log
  tested in M1).
- [x] PDF/Excel exports of the tax file.

**Tested:** 74/74 tests (including assembly of the tax file per legal form). Demo
verified: SNC 11 000 → 5 500 per shareholder; Sàrl profit 55 000, equity 22 000.
Build OK. Not covered (product decision): computing the final cantonal/federal tax
amount.

---

## M6 — Exports, backup, seed, UI polish  ✅
- [x] Full backup (.sqlite) + restore (with restart); JSON export/import per company or
  global (import = ID remapping, creates new entities).
- [x] Global JSON + Excel export (invoices + third parties per company).
- [x] Demo data (seed): sole proprietorship + simple partnership + SNC + Sàrl (done in M1).
- [x] Light/dark mode, legal form badge, frameless window (previous batches).
- [x] Duplication of a company's configuration.
- [x] Settings page: VAT settings per company (VAT registration, period, method,
  accrual/cash basis).

**Tested:** 77/77 tests (including export→import round trip with remapped FKs +
isolation). Build OK. Restoring a .sqlite triggers a clean restart of the app.

---

## M7 — Windows & macOS packaging  ✅
- [x] electron-builder: NSIS `.exe` (`build:win`) + DMG `.dmg` (`build:mac`) + Linux
  AppImage (`pack:linux`).
- [x] Icon (`resources/icon.png`, generated blue rounded square « Q »), metadata (appId,
  copyright), NSIS shortcuts.
- [x] Deterministic native rebuild: `npm run rebuild:electron` (forced) **before**
  electron-builder + `npmRebuild: false` (the internal rebuild, without `-f`, may be
  skipped through its cache → binary in Node ABI → the packaged app crashes). Migrations
  included via `extraResources`.
- [x] README: installation, dev, Win/Mac build (+ note "each installer on its own OS").

**Tested:** Linux packaging (`electron-builder --linux dir`) validated end to end —
`better_sqlite3.node` in Electron 34.5.8 ABI, packaged migrations, **packaged app
launched with 0 errors** (DB + migrations OK via `process.resourcesPath`). The
`.exe`/`.dmg` are built on Windows / macOS respectively (same logic, host = target).

**Testing:** install the `.exe` on Windows and the `.dmg` on macOS, launch the app,
create a company, enter an invoice, generate a VAT return.

---

## M8 — Quotes, contracts and PDF documents  ✅
- [x] **Quotes** (`quotes` + `document_lines`): `DC<YYYYMMDD><NN>` numbering,
  section/service/detail lines, totals per rate, draft → sent → accepted → invoiced
  cycle, automatic expiry once past the validity date.
- [x] **Conversion into an invoice**: creates a sales invoice **as a draft** carrying
  over the lines, numbered `FC<YYYYMMDD><NN>`. One invoice **per VAT rate** so that the
  FTA breakdown (303/313/343) stays correct. The quote never enters the VAT return;
  the invoice enters it once **issued**.
- [x] **Contracts** (`contracts` + `contract_templates`): `CC<YYYYMMDD><NN>` numbering,
  default template with 15 articles and variables, articles frozen at creation,
  attachment to an accepted quote, draft/sent/signed/terminated statuses.
- [x] **PDF on the QWASAR template**: Inter embedded (400/700/900 + italics, offline),
  Inter Black logo and band of « Q » at 40 % in the company's color, Description /
  Qty. / Unit price / Gross total tables. Rendered via `printToPDF`, preview and export.
- [x] **Swiss QR-bill** (`swissqrbill`): standardized 210×105 mm payment part in French,
  validated IBAN, QR reference derived automatically for a QR-IBAN. The invoice stays
  printable without a QR code (an explicit message rather than a failure).
- [x] **Bank accounts** per company (`bank_accounts`) + structured addresses on
  companies and third parties (required by the QR standard and reused on the documents).
- [x] **Scope of the contract**: it covers the whole quote — the one-off amount
  (`one_off_amount_ht`) *and* the subscription — because it is the contract that
  guarantees payment of the fixed price. Summary of commitments at the top of the PDF.
- [x] **Commercial view on the dashboard**: pipeline in progress, accepted and awaiting
  invoicing, lost, conversion rate. A quote refused and then **revised**
  (`superseded_by_quote_id`) is counted neither as lost nor in the rate: the revised
  version carries the deal.

**Fixed along the way:** **draft** invoices entered the VAT return on the "accrual"
basis (the safeguard existed only for the "cash" basis). Under the accrual method VAT
is due on issue: a draft is now excluded whatever the basis. `formatChf` also produced
a decimal comma depending on the ICU version — Swiss formatting (`1’234.50`) is now
explicit and shared between screen and PDF.

---

## M9 — Fund contributions (money paid in by shareholders)  ✅
- [x] **`fund_contributions` table** linked to the shareholder (`ON DELETE SET NULL`:
  a shareholder leaving does not erase the funding history) and, for a bank transfer,
  to the credited bank account. Amount always positive; the direction comes from `kind`.
- [x] **Three kinds**: `capital` (equity, non-repayable), `current_account` (repayable
  advance — a debt of the company towards the shareholder) and `repayment` (repayment,
  counted as negative).
- [x] **Outside VAT, outside turnover**: a contribution is not income. A separate table
  that no VAT return computation reads — verified by a test comparing the return before
  and after a 50 000 CHF contribution.
- [x] **Dedicated screen**: position per shareholder (capital / shareholder loan
  account / repaid / net), movement history, deletion through the action bar.
- [x] **Cash position on the dashboard**: available = net contributions + gross sales
  collected − gross purchases paid, cumulative since inception, against the purchases
  still to be paid. This answers "can I pay the first invoices?".
- [x] **Backup**: contributions follow the JSON export/import, each one being re-linked
  to the **imported** shareholder (identifier remapping).

---

## M10 — Configurable branding, split address book, CI  ✅
- [x] **PDF branding per company** (`company_brand_settings`): text logo / imported
  image / none, height, color, right-edge pattern (character, size, opacity, or
  removed), contact line, quote signatures. **Defaults = the QWASAR template down to
  the millimeter** — verified by tests comparing the produced CSS with the original
  constants. Preview on a sample document, with unsaved settings.
- [x] **Address book split into two pages**: Customers and Suppliers, same table
  (`third_parties`); a "both" third party appears in each.
- [x] **GitLab CI**: validations on every branch, release from `main` only (see README).
- [x] **Housekeeping of `release/`** after each Windows build: a single installer at the
  root, the previous ones deleted if published on GitLab, archived otherwise.

---

## M11 — Partners, third-party deletion, LFS release  ✅
- [x] **Partners**: read from the address book (customer company + at least one
  contract), derived, never out of sync.
- [x] **Permanent deletion of a third party** (in addition to archiving), refused if the
  third party carries history (invoices, quotes, contracts) — repository + IPC guard.
- [x] **Publishing the installer**: first as a CI job artifact, then via **Git LFS** —
  the exe travels with the commit (SSH auth, no token), the pipeline retrieves it
  (`git lfs pull`), archives it to the registry and attaches it to the release through
  a web URL.

## M12 — Multi-view dashboards + targets  ✅
- [x] **Dashboard split into views**: overview, finances, cash position, commercial —
  KPIs, charts, **month-over-month** and **year-over-year** comparisons, cumulative
  profit, receivables ageing, quote pipeline, top customers, recurring revenue
  (MRR/ARR).
- [x] **Management targets**: rich catalog (turnover, profit, expenses, margin, quotes
  won, conversion rate, new customers, contracts, recurring revenue, contributions…),
  per year / quarter / month, floor or ceiling. Progress recomputed continuously from
  the data, surfaced in every view. Pure and tested logic (`tests/objectives`).
- [x] **Consolidated multi-company view removed**: the dashboard is now single-company.

## M13 — « Réglé (pour TVA) » invoice status (settled for VAT)  ✅
- [x] **`settled_vat` status**: an invoice settled by a third party but recorded in the
  company in order to **recover the input tax** (inter-company case, one being
  VAT-registered and the other not). **Enters the VAT return** (attached by issue date)
  but stays **outside the result** (income/expenses), **outside the cash position** and
  never "overdue". A centralized pure predicate `isVatOnly()`; no migration (the
  `status` column is free text).

## M14 — Quick filters by VAT period (invoice list)  ✅
- [x] **Period buttons** tailored to the company's VAT return type (quarterly →
  Q1..Q4, semi-annual → S1/S2, annual → « Année » / year) with a year picker,
  **combinable** (toggle) and **additive** to the existing filters (type, status,
  search, From/To).
- [x] **`InvoiceFilters.issueRanges` filter**: a list of issue date ranges combined with
  **OR** on the SQL side — pagination and counters stay correct, no client-side
  filtering. `periodType` loaded via `vatSettings:get`.
- [x] **Release**: the download link label shows the **name of the exe**
  (`Qompta-X.Y.Z-setup.exe`).

## M15 — Cash reconciliation  ✅
- [x] **Realign the cash position** on the actual bank balance at a given date (private
  withdrawals, cash, unrecorded differences) from the **Trésorerie** (cash) view. The
  **actual balance** is what gets entered; the latest reconciliation at a date is
  authoritative and only **later** flows are added to it — an earlier entry added after
  the fact no longer moves the present cash position (but stays in the lists, reports
  and VAT return).
- [x] `cash_reconciliations` table (isolated by `company_id`), **outside the result and
  outside the VAT return** (like fund contributions). Added to the backup and to
  company duplication.
- [x] Driven from the dedicated **Trésorerie** (cash) menu.

## M16 — Dedicated menus + year filter fix  ✅
- [x] **Trésorerie** (cash) and **Objectifs** (targets) become full-fledged **menu
  entries**; the dashboard stays focused on **visualization** (overview, finances,
  commercial).
- [x] **Invoice period filters**: the **year** is a toggle button (whole year, exclusive
  with the quarters) and the **arrows filter** the selected year even without a quarter
  selected — fixes the "I switch to 2025 but still see 2026" case.

## M17 — Section-based navigation + harmonized year picker  ✅
- [x] **Side menu in collapsible sections** (accordion): Pilotage (steering), Ventes
  (sales), TVA & impôts (VAT & taxes), Associés & fonds (shareholders & funds), Carnet
  d'adresses (address book), Configuration. Only the section of the current screen is
  open initially; a closed section containing the active screen carries a dot.
- [x] **Harmonized year picker**: shared `YearStepper` component (arrows `‹ 2026 ›`) on
  the dashboard and the cash view, replacing the drop-down menu.

## M18 — Customizable dashboards  ✅
- [x] **Several dashboards per company** (tabs), created from **templates** via the
  « + » button (6 templates including Profitability, Customers & pipeline, Collection &
  receivables), renamable, deletable. **Dashboard = the default view**, pinned at the
  top of the menu outside the sections.
- [x] **Free-form grid** in « Modifier » (edit) mode (home-made, pointer events, dotted
  background): free move and **resize** (x/y/w/h in cells) **with collisions**;
  **size-adaptive** rendering (a minimal KPI = just the figure, with a font that grows;
  charts that fill their cell).
- [x] **Widgets**: KPI (from the catalog metrics) or chart — pre-built **+ a custom
  chart** (bar/line/pie × dimension month / categories / customer / stage × value).
- [x] **New metrics** (« Trésorerie & créances » — cash & receivables category):
  customer receivables, supplier payables, overdue amount, **DSO** (average collection
  period), **expense ratio**. **New charts**: invoiced vs collected, profit waterfall,
  turnover per customer, cumulative new customers.
- [x] `dashboards` table (isolated by `company_id`, widgets as JSON), included in the
  backup; **targets are now included too** (an oversight, now fixed). New templates
  pushed to existing companies through a version flag (once only, existing ones never
  overwritten).

---

## M19 — Legal forms, test companies & cash/tax links  ✅
- [x] **« Réglé (pour TVA) »** (settled for VAT) invoice status hidden for a company
  that is **not VAT-registered**.
- [x] **Association**: tax on the **profit only** (no more inconsistent capital part).
- [x] **Legal form conversion**: switches accounting to **double-entry** (Sàrl/SA/SNC)
  and **completes the chart of accounts** with the missing capital accounts (idempotent).
- [x] **Test companies** (`TEST_` prefix): created from the Companies page, hard
  deletion reserved for those companies; **active/inactive status** editable;
  **duplication** via an icon on each company (removed from Settings).
- [x] **VAT return paid → cash position**: the net amount paid to the FTA (or the
  refund) leaves (or enters) the cash position at the payment date
  (`buildCashPosition`).
- [x] **Sàrl/SA equity** made editable (capital, reserves, carry-forward, manager
  salary, dividends, non-deductible expenses) through a form on the Taxes page
  (`company_equity` table), feeding the profit tax + capital tax.

## M20 — QomptAI, a 100 % local AI assistant  ✅ (v1.16.0)
- [x] **Accounting chat inside the app** (`features/assistant/AssistantPage.tsx`, pinned
  entry) — **no data leaves the machine** (cloud forbidden, accounting data).
- [x] **Qwen2.5 7B model** (node-llama-cpp) on the **integrated Iris Xe GPU via Vulkan**
  (`getLlama({gpu:"vulkan"})`, CPU fallback) — about 6× faster than the CPU, 100 % local.
- [x] **Hybrid architecture** (`src/main/ai/`): **instant deterministic answers**
  (lookups via `dashboard.metrics`, **exact computations** done in code — profitability,
  profit/turnover target, price simulation, product/pace/sales projection, explanations
  of the result & cash position), plus the **7B doing the reasoning** (streaming) on a
  snapshot of the real figures for open questions. The model never does the arithmetic
  of the deterministic path.
- [x] **Conversation follow-up** (« et au 2ème ? » — and in the 2nd?) + persisted 👍/👎
  **memory** (`app_settings ai:feedback`, independent of the model): it does not repeat
  a rejected answer, changes approach, honestly admits a dead end.
- [x] Technical details and pitfalls (Vulkan, N-API, per-platform binaries): `CLAUDE.md`
  § "QomptAI (M20)". Diagnostics outside Electron: `scripts/ai-diagnostic.mts`.

## M21 — QomptAI: history, memory & read-only access to the whole accounting  ✅ (v1.17.9)
- [x] **Persisted history** per company: `ai_conversations` / `ai_messages` tables
  (isolated by `company_id`, durations in **whole milliseconds**). Every exchange is
  recorded as it happens; the conversation title comes from the first message.
- [x] **History column** in the QomptAI screen: reopen a conversation (with its cards,
  its timings and its 👍/👎), start a new one, **rename** in place, **delete**
  (deferred action bar) or **clear everything**.
- [x] **Conversation memory**: the current thread is replayed to the model on every
  turn, and the follow-up context (« et au 2ème ? » — and in the 2nd?) is **rebuilt from
  the history** when a thread is reopened — so it survives an app restart.
- [x] **Long-term memory**: past exchanges about the same subject (keyword matching,
  `src/shared/ai/memory.ts`, pure and tested) are replayed to the model. An answer
  rejected with a 👎 is never recalled.
- [x] The history **follows the company** through JSON backup/restore (conversations
  remapped, messages re-attached). Still **100 % local**: nothing leaves the machine.
- [x] **Read-only access to the whole accounting** (`src/main/ai/data.ts`): ten sections
  read from the repositories — **targets** (with actual progress), **invoices**
  (details, customer, status, unpaid), **customers & suppliers** (including top
  turnover), **quotes**, **contracts**, **shareholders & contributions**, **company**
  (legal form, IDE, VAT, IBAN), **taxes** (tax file), **expense items**, **cash
  reconciliations**. If the question is about them → an instant deterministic card;
  open question → the relevant sections are injected into the 7B's context, which
  reasons on real data.
- [x] **« / » commands — the only door to an instant answer**: `/clients`,
  `/factures 2025`, `/tva`, `/objectifs`, `/devis`, `/contrats`, `/impots`, `/charges`,
  `/associes`, `/societe`, `/pointages`, `/finances`, `/tresorerie`, `/pipeline`,
  `/commercial`, `/resultat`, `/liquidites`, `/calcul`, `/historique`, `/aide`. The menu
  opens as soon as « / » is typed, above the field, and narrows with each letter
  (↑/↓, Tab, Enter).
- [x] **Without « / », the model always does the work**: no more keyword routing.
  Guessing the intent of a free-form sentence served cards beside the point (a follow-up
  « pas comme ça, fais-moi une liste écrite » — not like that, give me a written list —
  served the same table again).
- [x] **The model READS the database itself** (function calling, `src/main/ai/tools.ts`):
  twelve lookup tools — figures for a period, invoices, third parties, quotes,
  contracts, targets, VAT, company, shareholders, expenses per item, tax file,
  reconciliations. It chooses the tool **and its parameters** (year, month, status,
  customer name) and chains several reads if needed; each one is displayed live in the
  chat. No more unrequested data is pushed to it: it fetches what it needs. Verified on
  the real model (`scripts/ai-diagnostic.mts`): « combien le mois dernier ? » (how much
  last month?) → reads June's figures; « ai-je des impayés ? » (do I have unpaid
  invoices?) → reads the unpaid invoices.
- [x] **Assistant settings**: its **name** (it is no longer necessarily called QomptAI)
  and **who you are** in that company (name + role, per company) — it addresses you
  directly and no longer quotes you as one shareholder among others.
- [x] **KPIs and charts in the chat**: the command cards carry an illustration (bars of
  the monthly turnover on `/finances`, turnover per customer on `/clients`, pie chart of
  the expenses on `/charges`). Reserved for cards computed in code: a figure carried by
  a chart must be exact, it is not left to the model.
- [x] **Legal notice** below the chat: the assistant can be wrong, important figures
  still have to be checked in the application.
- [x] **A 👎 makes it change angle, it no longer gags it**: the rejected answer is quoted
  to the model ("don't do that again") with a freer temperature, instead of the old
  short-circuit that answered "I'm not sure" without even trying.
- [x] **Read-only guaranteed by construction**: the `AiDataDeps` type only declares
  `list`/`get`/`dossier` methods — the assistant physically has no way to write, on top
  of the `isActionRequest` safeguard that refuses any creation/modification request.
- [x] *(v1.17.11)* **No invented figures — a mechanical check before publication**
  (`src/shared/ai/figures.ts`, tested): any amount, percentage or large number written
  by the model must be found in what the lookup functions returned during the turn (or
  in the memory / the question). Otherwise a retry quoting the offending figures, then
  **refusal to publish the answer** — an admission and a pointer to `/finances`.
  Triggered by a real case: targets read correctly, then a « Chiffres clés 2026 » (key
  figures 2026) block made up out of thin air.
- [x] *(v1.17.9)* **Opaque command menu**: it carried `bg-popover`, a class absent from
  the palette (`tailwind.config.js`) — with no background, the answer's chart showed
  through the suggestions.
- [x] *(v1.17.9)* **Targets as progress bars** in the `/objectifs` card: the label on its
  own line (it overlapped the value as soon as it got long), the percentage becomes a
  bar using the dashboard's color code. A `bar` field on a card row (`AiAnswerRow`):
  reusable for any progress.

## M23 — Switch to Qwen3 8B, measured on a benchmark  ✅ (v1.19.0)
- [x] **Comparative benchmark** (`scripts/ai-bench.mts`, outside the application, with no
  database access): the six questions that had actually failed, put to both models with
  the same system prompt, the same tools and the same frozen data. Automatic measurement
  of the correct function being called, of the expected silence on a definition, of
  invented figures (`figures.ts`), of the language and of the time taken.
- [x] **Result**: Qwen2.5-7B → **1 fully correct answer out of 6** (no lookup at all on
  "how is my company doing", an answer **in Chinese** to "what is EBITDA", a wrong
  computation, a mis-named month). Qwen3-8B → **5 out of 6**, spontaneously chaining two
  lookups. Almost identical footprint (5.0 GB versus 4.7 GB), but **slower per answer**
  (59 s versus 33 s on the benchmark) — offset in practice by the absence of retries.
- [x] **`/no_think` is mandatory**: Qwen3 is a hybrid model that reasons out loud.
  Without that suffix, measured: **131 s for an empty answer**, all the tokens gone into
  the reasoning. Residual tags (`<think>`, `<definition>`) are stripped before any check
  (`stripModelTags`, tested).
- [x] **Adopting an already present model** (`findLocalModel`): changing model no longer
  requires a 5 GB download if the file is already in `userData/models`.
- [x] **An absurd parameter is rejected by the computation** (`usableRate`): on the
  benchmark, the model passed an invented margin of 0.06 % → "sell 117'015 units"
  instead of 59. The anti-invention check could see nothing (the figure did come from
  the computation): so it is up to the engine to refuse a rate outside [1 %, 100 %], and
  to report it.

## M24 — Open source without AI, encrypted data, section-based contracts  ✅ (v1.20.0 → v1.20.1)
> M20 to M23 (QomptAI) are **removed**: Qompta becomes an open source application
> without AI. Code, tests, the `node-llama-cpp` dependency, the `ai_*` tables
> (migration 0016) and the local model (`userData/models`, ~5 GB, deleted on first
> launch) all disappear.
- [x] **Signatures**: `signatures` table (linked to a shareholder), drawing or image,
  default signature; printed at the bottom of quotes (signatory chosen per quote) and
  in the contracts.
- [x] **Undo everywhere**: « Annuler » (undo) after every modification (undo log through
  temporary triggers), « Reprendre » (resume) after closing a modified entry form (the
  form is kept intact). Lived through: a contract template lost on a click on
  « Annuler ».
- [x] **Contracts built from sections**: 10 section types, a builder (add, drag and
  drop, duplicate, collapse, variables to insert, preview), two-step creation (template
  then construction), 8 ready-made structures.
- [x] **Encryption**: database in memory, AES-256-GCM `.qdb` file, recovery key written
  down off the machine, automatic encrypted backup on every launch (7 days), `.qexp`
  exports, cross-machine restore using the key.
- [x] **v1.20.1**: crash when enabling encryption fixed — better-sqlite3's `serialize()`
  is forbidden by V8's memory sandbox (Electron 34); replaced by a logical copy
  (`db/dump.ts`), verified inside Electron on a copy of the real database. Lesson: any
  native code that manipulates buffers must be tested INSIDE Electron (293 tests).

## Cross-cutting quality tracking
- Strict TypeScript over the whole codebase.
- Mandatory unit tests on: VAT computation, shareholder allocation, Sàrl profit/capital,
  money/rounding, cross-company isolation. **Zero computation errors tolerated.**
- Versioned migrations, never any data loss.
