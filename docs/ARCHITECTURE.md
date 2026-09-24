# Technical architecture — Qompta

## 1. Overview of the Electron processes

```
┌──────────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                          │
│  - Window creation, menu, app lifecycle                          │
│  - Exclusive access to the SQLite database (better-sqlite3)      │
│  - File system access (attachments, backups, PDF)                │
│  - IPC handlers (ipcMain.handle) → DB repositories               │
│  - Drizzle migrations at startup                                 │
└───────────────▲──────────────────────────────────────────────────┘
                │  Typed IPC (contextBridge + ipcRenderer.invoke)
┌───────────────┴──────────────────────────────────────────────────┐
│  PRELOAD (contextIsolation: true, nodeIntegration: false)        │
│  - Exposes window.api: a typed, restricted IPC surface           │
└───────────────▲──────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────────┐
│  RENDERER (Chromium) — React 18 + Tailwind + shadcn/ui           │
│  - UI, application state, active company (context)               │
│  - NEVER accesses the DB or the FS directly                      │
│  - Calls window.api.* → main → DB                                │
└──────────────────────────────────────────────────────────────────┘
```

**Security principle**: the renderer is "sandboxed". No direct Node access.
Every sensitive operation (DB, files, PDF, exports) goes through a named IPC channel,
validated by **zod** on the main side before execution.

## 2. Folder layout

```
src/
├─ main/
│  ├─ index.ts                 # bootstrap: key → encrypted database → migrations → handlers
│  ├─ ipc/registerHandlers.ts  # ALL business handlers, grouped by domain
│  ├─ ipc/windowHandlers.ts    # window controls (before the data is opened)
│  ├─ security/vault.ts        # encrypted .qdb/.qbak/.qexp format, recovery key (§11)
│  ├─ security/keystore.ts     # machine key protected by safeStorage (DPAPI)
│  ├─ storage.ts               # in-memory database ⇄ encrypted qompta.qdb file
│  ├─ backups.ts               # encrypted automatic and manual backups
│  ├─ undo.ts                  # undo log (temporary triggers, §12)
│  └─ export/
│      ├─ vatExport.ts         # VAT return as Excel / PDF
│      ├─ taxExport.ts         # tax file
│      ├─ dataExport.ts        # Excel export of one company
│      └─ pdf/                 # business documents in the QWASAR template
│          ├─ theme.ts         # embedded Inter fonts, CSS, Q pattern band
│          ├─ documentHtml.ts  # quotes and invoices (split into tables)
│          ├─ contractHtml.ts  # contracts (typed sections, signatures)
│          ├─ build.ts         # database -> printable document
│          └─ render.ts        # HTML -> printToPDF
│
├─ preload/index.ts            # window.api built from IPC_CHANNELS
│
├─ renderer/src/
│  ├─ main.tsx, App.tsx        # side navigation, active company
│  ├─ app/                     # CompanyContext, ThemeContext, ActionBarContext, useFormDialog
│  ├─ components/ui/           # in-house primitives (Button, Card, Modal…)
│  ├─ components/              # CompanySwitcher, WindowControls
│  ├─ features/                # one folder per module:
│  │                           #   dashboard, companies, quotes, invoices,
│  │                           #   contracts, vat, tax, associates,
│  │                           #   thirdparties, accounts, settings,
│  │                           #   treasury, signatures, security (setup)
│  └─ lib/                     # CHF/date formatting, UI helpers
│
├─ shared/                     # PURE BUSINESS CORE (testable, no Electron/DB)
│  ├─ ipc.ts                   # typed IPC contract (channels + types)
│  ├─ types.ts                 # domain types
│  ├─ money.ts                 # arithmetic in cents, Swiss CHF formatting
│  ├─ legal-form.ts            # rules per legal form
│  ├─ invoice.ts               # invoice computation
│  ├─ dashboard.ts             # dashboard aggregates (quotes included)
│  ├─ schemas/                 # zod: company, invoice, document
│  ├─ vat/                     # codes, rates, mapping, aggregate,
│  │                           # buildReturn, compute, period, returnLines
│  ├─ tax/                     # result, allocation, company-tax, dossier
│  ├─ backups.ts, signatures.ts # backup naming/retention, signatures
│  └─ documents/               # totals, numbering, convert, qrbill, contract-template,
│                              # contract-blocks (sections), contract-models (catalog)
│
└─ db/
   ├─ schema.ts                # Drizzle tables
   ├─ migrations/              # versioned migrations (drizzle-kit)
   ├─ client.ts, migrate.ts    # better-sqlite3 opening + application
   ├─ repositories/            # 1 repo per aggregate, company_id mandatory
   └─ seed.ts                  # 4 demo companies
```

> The IPC handlers live in **a single** `registerHandlers.ts` rather than one file per
> domain: they are mostly one-line delegations to a repository, and splitting them up
> would have multiplied the number of files without any gain in readability. The UI
> uses in-house primitives, not shadcn/ui, and calls IPC directly from `useEffect` —
> with no cache layer such as TanStack Query.

## 3. IPC contract (typed end to end)

`src/shared/ipc.ts` defines a `{ channel: { input, output } }` map. The preload builds
`window.api` from that map; the main process registers the matching handlers.
Every input is validated by its zod schema before it reaches a repository.

Examples of channels actually exposed:
- `companies:list`, `companies:create`, `companies:update`, `companies:archive`,
  `companies:duplicate`, `companies:convertLegalForm`
- `invoices:list` (filters + pagination), `invoices:create`, `invoices:update`,
  `invoices:delete`, `invoices:nextNumber`, `invoices:exportPdf`
- `quotes:create`, `quotes:setStatus`, `quotes:convertToInvoice`, `quotes:revise`,
  `quotes:exportPdf`
- `contracts:fromQuote`, `contracts:templates`, `contracts:saveTemplate`, `contracts:setStatus`,
  `contracts:exportPdf`
- `vat:compute` (companyId + period), `vat:lock`, `vat:exportPdf`
- `tax:dossier` (companyId + financial year)
- `signatures:list|create|update|remove|pickImage`
- `security:status|newKey|saveKeyFile|activate|resetData|revealKey` (available before the data is opened)
- `backup:config|setConfig|runNow|list|saveAs|restore|exportCompanies|importCompanies`
- `undo:checkpoint`, `undo:revert` (action bar)

The runtime `IPC_CHANNELS` list acts as a guard rail: the preload rejects any channel
that is not in it.

Every business handler is wrapped: after the call, `store.touch()` rewrites the encrypted
database if any data changed (see §11).

## 4. Data isolation per company

- Every business table carries `company_id` (FK `companies.id`).
- Repositories **require** a `companyId` argument; there is no business read/write method
  without that filter (except for genuinely global tables:
  `companies`, `vat_rate_defaults`, `app_settings`).
- Automated isolation test: create 2 companies, insert data into each one,
  check that no query on one company returns the other one's data.
- **No** cross-company read: dashboards are single-company (the consolidated view was
  removed in M12). Every query stays filtered by `company_id`.

## 5. Money & rounding

- Internal storage in **cents (INTEGER)**. No monetary value as a `float`.
- `src/shared/money.ts` centralises: addition, VAT = round(amount × rate),
  net↔gross conversion, commercial rounding to the cent, `CHF 1 234.55` formatting.
- VAT rounding: FTA rule (round to the nearest cent), applied per line.

## 6. PDF document generation

Chain: `build.ts` assembles a printable document from the database → `theme.ts` /
`documentHtml.ts` / `contractHtml.ts` produce a self-contained HTML → `render.ts`
prints it through `webContents.printToPDF` in an off-screen window.

Five constraints shaped this layout, all of them discovered in practice:

1. **Embedded fonts.** Inter is read from `resources/fonts` and injected as
   base64 into the HTML. The rendering window has no access to system fonts and
   the app must produce an identical rendering offline. The folder is resolved through
   `app.getAppPath()` — never relative to the module, since the main process is bundled
   into `out/main/`.
2. **Vertical margins in `thead`/`tfoot`.** A top/bottom `padding` only applies
   once: from the 2nd page on, the text was stuck against the edge. The content is
   therefore wrapped in a table whose header and footer act as spacers, which the
   print engine replays on every page.
3. **`@page { margin: 0 }`.** Chromium **clips** fixed-position elements to
   the content area: any sheet margin would stop the Q pattern band and the
   QR payment part from reaching the edges. Horizontal margins come from a
   content `padding`, which does apply on every page.
4. **No scaling.** Content overflowing the width of the content area
   triggers a silent Chromium "shrink to fit". That is unacceptable
   for the QR-bill, whose 210 × 105 mm are standardised — hence its
   width obtained through negative margins rather than through an overflow.
5. **QR-bill at the bottom of the *last* page.** In fixed position it repeated
   on every page and the content slid underneath it as soon as the invoice overflowed. It
   is therefore rendered **in the flow**, preceded by a `.doc-content` block stretched to
   `page count × usable page height − 105 mm` (`qrFillMm`). The page count is
   known only after printing: `htmlToPdfBuffer` takes an HTML builder,
   prints a first time without stretching anything, counts the pages of the PDF
   (`countPdfPages`), measures the height of the `thead` in the DOM, then prints again. A negative bottom margin of 0.6 mm
   removes from the flow what a pagination rounding could otherwise turn into a blank
   page, without detaching the payment part from the physical edge.

Quotes and invoices carry a **repeated header** (logo, contact, issuer, customer)
placed in the `thead` of the wrapping table: it is the only block the print
engine replays on every page. Since its height varies with the customer's address, the
usable height of a page (297 mm − `thead`) is measured at render time rather than fixed. Contracts
keep their header on the first page only.

The QR-bill is generated by `swissqrbill/svg`, whose SVG output is inlined
into the HTML. The data is prepared and validated in `shared/documents/qrbill.ts`
(IBAN, QR reference derived when QR-IBAN): an invoice stays printable without
bank details, with an explicit message rather than a failure.

## 7. Attachments & files

- Stored outside the DB, in `userData/attachments/<company_id>/<uuid>.<ext>`.
- The DB keeps metadata (relative path, original name, MIME type, size, hash).
- Backups: ZIP archive of `userData` (DB + attachments) or targeted export per company.

## 8. Migrations & data non-regression

- Versioned Drizzle migrations, played idempotently at main process startup.
- Never a destructive migration without a copy step; migration tests on a snapshot.
- Schema version number stored in `app_settings`.

## 9. Tests (Vitest)

- **VAT logic** (`shared/vat/compute.ts`): all the totals 289/299/379/399/479/500/510,
  credit case, 379≠299 discrepancy case (warning), effective method vs TDFN.
- **Shareholder allocation** (`shared/tax/allocation.ts`): shares summing to 100 %,
  rounding of the allocation (the remainder goes to the last/majority shareholder), 2+ shareholders.
- **Sàrl** (`shared/tax/company-tax.ts`): taxable profit, equity capital,
  manager salary vs dividends.
- **Money**: rounding, net↔gross, idempotence.
- **Isolation**: no cross-company leak (integration test on an in-memory DB).
- **Documents** (`shared/documents/`): `DC`/`FC`/`CC` numbering, totals and
  fractional quantities, splitting into tables, QR-bill data.
- **Quote → invoice**: draft outside the VAT return, entering the VAT return on issue,
  one invoice per rate, locking of an already invoiced quote.
- **Migrations** (`tests/migrations-safety.test.ts`): fails if a migration
  contains a destructive statement or recreates a table through `__new_`.
- **zod schemas** (`tests/schemas-roundtrip.test.ts`): a complete object goes through
  every schema without losing a field — `parse()` silently drops any
  key absent from the schema, which has already made addresses disappear from the database.

## 10. UI state

- No cache layer (no TanStack Query either): screens call IPC from a
  `useEffect` and reload after a mutation.
- Active company = React context, persisted (key in `app_settings`); any change
  reloads the screens that depend on `companyId`.
- Light/dark mode through Tailwind `class` + persistence.

## 11. Data encryption and backups (v1.20.0)

- **The database lives in memory.** `storage.ts` decrypts `userData/qompta.qdb` and replays its
  logical copy (schema + rows, `db/dump.ts`) into a `:memory:` database, then rewrites the
  encrypted copy after every IPC call that modified data (batched over 400 ms) and
  on shutdown. Atomic write (temporary file + rename). **No
  `serialize()`**: in Electron 34 it crashes the main process (V8 memory
  sandbox). No new native dependency (no SQLCipher).
- **Format** (`security/vault.ts`, tested): `QMPT` | version | type | key fingerprint |
  IV | tag | gzip(data), AES-256-GCM with the header as authenticated data. Same
  format for `.qdb` (database), `.qbak` (full backup) and `.qexp` (JSON export).
- **Key**: 256 random bits, shown once to the user as a **recovery
  key** `QK1-` + 13 groups of 4 (Crockford base32), which they keep off the
  machine. On the machine it is protected by `safeStorage` (DPAPI) in `qompta.key`.
- **Startup**: without a key, the setup screen (`features/security/SetupScreen`)
  is displayed instead of the app; business handlers are registered only once
  the database is open. An old plaintext database (`qompta.sqlite`, ≤ 1.19) is encrypted,
  **verified** (read back identically), then deleted.
- **Backups** (`backups.ts`): automatic on every launch into
  `Documents\Qompta\Sauvegardes` (configurable), 7-day retention (the most recent one
  always kept, only the files `Qompta_AAAA-MM-JJ_HH-mm-ss*.qbak` are touched).
  Restore = "before-restore" backup, replacement of the `.qdb`, restart.
  An encrypted file from another machine opens with ITS recovery key.
- **Rescue**: `scripts/decrypt-backup.mjs` decrypts a file outside the app.

## 12. Generalised undo (v1.20.0)

- **Modify → « Annuler » (Undo)**: `src/main/undo.ts` installs TEMPORARY triggers on
  every business table; each modified row writes into `temp.undolog` the statement that
  restores it. The renderer brackets the operation with two `undo:checkpoint`
  (`actionBar.track`) and « Annuler » replays the range backwards (`undo:revert`,
  `defer_foreign_keys`). None of this is written into the encrypted database.
- **Close a form → « Reprendre » (Resume)**: `useFormDialog` + `Modal keepMounted` keep
  the form mounted, hidden, when it is closed after being modified; the bar offers
  « Reprendre » for 15 s and reopens it intact.
