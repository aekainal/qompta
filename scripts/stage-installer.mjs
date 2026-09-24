#!/usr/bin/env node
/**
 * Prepares the Windows installer built on this machine so it ships with the
 * commit, versioned through **Git LFS**.
 *
 * Replaces the former `upload:installer` (upload to the registry with a personal
 * token). Here, no token: the exe travels with `git push` (usual SSH auth).
 * The git history only receives an LFS pointer of ~130 B; the ~85 MB binary
 * lives in the LFS store. The pipeline (`release` job) fetches it, archives it
 * to the package registry and attaches it to the release.
 *
 * Usage:
 *   npm run build:win && npm run stage:installer
 *   git commit … && git push          (the version commit carries the exe)
 *
 * Prerequisite: `git-lfs` installed and `git lfs install` done once (otherwise
 * the exe would be committed raw — 85 MB in the history). This script checks it.
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const exeName = `Qompta-${version}-setup.exe`;
const exePath = `release/${exeName}`;

if (!existsSync(exePath)) {
  fail(
    `Installeur introuvable : ${exePath}\n` +
      "  Le construire d'abord : npm run build:win (voir README).",
  );
}

// git-lfs must be installed AND its filter active, otherwise `git add` would
// commit the 85 MB raw into the history instead of a pointer.
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

// Stages the current installer (through the LFS filter) and the removal of the
// old one (release-housekeeping already moved it out of release/). Only the exe
// is concerned: the rest of release/ is ignored (see .gitignore).
execFileSync("git", ["add", "-A", "--", "release"], { stdio: "inherit" });

// Checks that the staged file really is an LFS pointer, not the raw binary.
const staged = execFileSync("git", ["show", `:${exePath}`], { encoding: "buffer" });
if (!staged.subarray(0, 40).toString("latin1").includes("git-lfs")) {
  fail(
    `${exePath} n'a pas été indexé comme pointeur LFS.\n` +
      "  Le filtre LFS n'a pas tourné : vérifier `git lfs install` et .gitattributes.",
  );
}

console.log(
  `✓ ${exeName} indexé via Git LFS (pointeur, pas le binaire).\n` +
    "  Il partira avec ton prochain commit + push — la pipeline le publiera.",
);
