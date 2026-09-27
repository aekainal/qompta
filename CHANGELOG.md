# Changelog

All notable versions of Qompta. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions [SemVer](https://semver.org/).

## [Unreleased]

## [1.21.0] · 2026-09-27

### Added
- **Login password**: Qompta no longer opens without you. A password (10 characters at
  least, with a letter, a digit and a special character, checked live) is asked at every
  launch. Encrypting the disk was of little use while anyone at the session could open
  the application.
- **Windows Hello** (Windows only, optional): face, fingerprint or PIN open Qompta,
  offered right at launch; the password is always accepted too. Offered when the
  password is chosen, and in **Réglages → Connexion**. Linux and macOS: password only.
- **Réglages → Connexion**: change the password (the current one is required), enable
  or disable Windows Hello.

### Changed
- **Forgotten password**: « Mot de passe oublié ? » on the login screen asks for the
  **recovery key** and a new password. There is no other way to reset it.
- **Showing the recovery key** in Réglages now requires the login password.
- **Update from 1.20**: on the first launch, Qompta asks to choose the password once.
  The recovery key does not change; backups and exports open as before. The key of the
  machine, until now protected by Windows alone (`qompta.key`), now only exists
  wrapped by the password (`qompta.keyring`).
- **Setup of a new machine**: choosing the password is the third step, after the
  recovery key.
- **No more em dashes** anywhere in the interface, the PDFs, the exports or the
  documentation. An empty value now shows as "-"; screen subtitles and list entries use
  a middle dot ("Factures · Société", "FC… · titre"); the empty signature choice reads
  "Aucun"; a signature caption reads "Nom, fonction"; the VAT and tax export titles read
  "Décompte TVA · Société" and "Dossier fiscal 2026 · Société".
- **French punctuation**: no more comma before « et », « ou » or « où » in the interface,
  the contract templates and the user documentation.

## [1.20.5] · 2026-09-25

### Fixed
- **Pixelated taskbar icon on Windows**: the window received the 512 px PNG and
  Electron shrank it to 32 px itself. It now uses a hand-made 32 px `.ico`, shipped
  with the installed application. Linux and macOS keep the PNG.

## [1.20.4] · 2026-09-24

### Fixed
- **GitLab release**: 1.20.3 was published with the Windows installer only. The release
  now carries all three packages (Windows installer, `.deb`, AppImage), checks that the
  three are present before publishing anything, and can repair an incomplete release
  when its job is run again.
- Previous `.deb` and AppImage files are archived like the installer instead of being
  discarded.

## [1.20.3] · 2026-09-24

### Added
- **User documentation in French**, with 40 screenshots taken on a fictitious company:
  installation guide (`docs/fr/INSTALLATION.md`) and user guide (`docs/fr/GUIDE.md`).
- **Three packages per version**: Windows installer, Debian/Ubuntu `.deb` and AppImage.

## [1.20.2] · 2026-09-24

### Added
- **Open source release** on GitHub under Apache 2.0 with the Commons Clause (fork and
  redistribute freely, selling excluded).
- **New application icon**, now also shown in the sidebar and on the window.
- Linux `.deb` package.

### Changed
- Code comments and technical documentation are in English; the interface stays in
  French.
- Segoe UI comes first in the interface font on every platform.

## [1.20.1] · 2026-09-21

### Changed
- Sidebar: the "local" mention next to the version number is removed.

### Fixed
- **Crash when enabling encryption**: the in-memory copy of the database used a
  better-sqlite3 function (`serialize`) forbidden by Electron's memory sandbox, which
  closed the application. Replaced by a logical copy (schema + rows). No data was
  touched: the crash happened before any write.

## [1.20.0] · 2026-09-21

### Removed
- **QomptAI** (local AI assistant): screen, code, conversation history (`ai_conversations`/
  `ai_messages` tables), associated calculation engine, `node-llama-cpp` dependency.
  The local model (~5 GB in `%APPDATA%\Qompta\models`) is **deleted on the first
  launch**. Qompta becomes an open source application without AI.

### Added
- **Signatures** (Associés & fonds › Signatures): drawn or imported, attached to a
  shareholder, one by default. Printed at the bottom of quotes (signatory chosen per
  quote, or a blank line) and in the "Signatures" section of contracts.
- **Contracts built from sections**: article, list, table, part heading, free paragraph,
  box, parties, financial summary, signatures of both parties, page break. Insertion
  between two sections, drag-and-drop, duplication, collapsing, variable insertion, live
  preview.
- **Two-step creation** (contract and template): 1. choice of the template (yours by
  default), 2. building. Eight ready-to-use structures: service provision (Qwasar),
  subscription/maintenance, mandate, fixed-price work contract, NDA, freelance,
  amendment, free structure. Template duplication.
- **Undo everywhere**: every saved change offers "Annuler" (undo); closing a modified
  entry (Annuler, cross, click outside, Esc) offers "Reprendre" (resume), which reopens
  it intact, even if it was never saved.
- **Encryption of all data**: recovery key created on the first launch (to be kept off
  the machine), application database encrypted (`qompta.qdb`, AES-256-GCM), no accounting
  data left in the clear on disk.
- **Automatic encrypted backup** on every launch (`.qbak`) in
  `Documents\Qompta\Sauvegardes`, kept for 7 days; folder and duration adjustable. Backup
  list and one-click restore in the settings.
- **Encrypted exports** (`.qexp`); restore and import of a file coming from another
  machine with its recovery key. Fallback script `scripts/decrypt-backup.mjs`.

### Changed
- Old `.sqlite` backups and `.json` exports are still accepted on restore / import.
- A restore first creates a "before-restore" backup.
- Old contracts (articles only) print exactly as before.

## [1.19.3] and earlier

Detailed history by batch in [`docs/ROADMAP.md`](docs/ROADMAP.md) (M0 to M23).
