#!/usr/bin/env node
/**
 * Prepares the packages built on this machine so they ship with the commit,
 * versioned through **Git LFS**.
 *
 * Three packages are published for every version: the Windows installer, the
 * Debian package and the AppImage. No token is involved: they travel with
 * `git push` over the usual SSH auth. The git history only receives an LFS
 * pointer of ~130 B each; the binaries live in the LFS store. The pipeline
 * (`release` job) fetches them, archives them to the package registry and
 * attaches them to the release.
 *
 * Usage:
 *   npm run build:win                 on Windows  -> release/Qompta-<v>-setup.exe
 *   npm run pack:linux                on Linux    -> release/Qompta-<v>.deb + .AppImage
 *   npm run stage:installer
 *   git commit … && git push          (the version commit carries all three)
 *
 * The Linux build must NOT run in this working copy: rebuilding the native
 * module for Linux would overwrite the Windows-ABI binary and break `npm run dev`.
 * Build it in a separate copy, then drop the two files into release/ here.
 *
 * Prerequisite: `git-lfs` installed and `git lfs install` done once (otherwise a
 * binary would be committed raw: 85 MB in the history). This script checks it.
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const version = JSON.parse(readFileSync("package.json", "utf8")).version;

/** The three published packages, in the order the README lists them. */
const packages = [
  { name: `Qompta-${version}-setup.exe`, how: "npm run build:win (sous Windows)" },
  { name: `Qompta-${version}.deb`, how: "npm run pack:linux (dans une copie séparée)" },
  { name: `Qompta-${version}.AppImage`, how: "npm run pack:linux (dans une copie séparée)" },
];

const missing = packages.filter((p) => !existsSync(`release/${p.name}`));
if (missing.length) {
  fail(
    "Paquet(s) manquant(s) dans release/ :\n" +
      missing.map((p) => `  - ${p.name}  →  ${p.how}`).join("\n") +
      "\n  Les trois doivent partir ensemble : une version publiée sans son paquet\n" +
      "  Linux laisserait un lien mort sur la release.",
  );
}

// git-lfs must be installed AND its filter active, otherwise `git add` would
// commit the binaries raw into the history instead of pointers.
try {
  execFileSync("git", ["lfs", "version"], { stdio: "ignore" });
} catch {
  fail(
    "git-lfs n'est pas installé sur ce poste.\n" +
      "  Installer puis initialiser :\n" +
      "    sudo apt-get install -y git-lfs && git lfs install",
  );
}
const cleanFilter = execFileSync("git", ["config", "--get", "filter.lfs.clean"], {
  encoding: "utf8",
}).trim();
if (!cleanFilter) {
  fail("Le filtre LFS n'est pas configuré. Lancer une fois : git lfs install");
}

// Stages the current packages (through the LFS filter) and the removal of the
// previous ones (release-housekeeping already moved them out of release/). Only
// those three names are concerned: the rest of release/ is ignored (.gitignore).
execFileSync("git", ["add", "-A", "--", "release"], { stdio: "inherit" });

// Checks that each staged file really is an LFS pointer, not the raw binary.
for (const { name } of packages) {
  const staged = execFileSync("git", ["show", `:release/${name}`], { encoding: "buffer" });
  if (!staged.subarray(0, 40).toString("latin1").includes("git-lfs")) {
    fail(
      `release/${name} n'a pas été indexé comme pointeur LFS.\n` +
        "  Le filtre LFS n'a pas tourné : vérifier `git lfs install` et .gitattributes.",
    );
  }
}

console.log(
  `✓ ${packages.length} paquets indexés via Git LFS (pointeurs, pas les binaires) :\n` +
    packages.map((p) => `    ${p.name}`).join("\n") +
    "\n  Ils partiront avec ton prochain commit + push et la pipeline les publiera.",
);
