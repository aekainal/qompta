#!/usr/bin/env node
/**
 * Housekeeping of the `release/` folder after the Windows installer is built.
 *
 * Rule: **only the installer of the current version stays at the root**. For
 * each installer of an earlier version:
 *  - if the matching GitLab release exists, the file is **deleted** —
 *    it stays downloadable from GitLab, keeping a duplicate brings nothing;
 *  - otherwise (or if GitLab is unreachable, or without an access token), it is
 *    **moved into `release/archives/`**. We never destroy an installer that we
 *    could not find published somewhere.
 *
 * The blockmap always follows its installer.
 *
 * Run automatically by `npm run build:win` (hook `postbuild:win`) and by the
 * CI after packaging. GitLab access uses `CI_JOB_TOKEN` in CI, or
 * `GITLAB_TOKEN` locally; without a token, everything goes to the archives.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const RELEASE_DIR = "release";
const ARCHIVE_DIR = join(RELEASE_DIR, "archives");

const version = JSON.parse(readFileSync("package.json", "utf8")).version;

/** `Qompta-1.4.0-setup.exe` -> `1.4.0`. Returns null if the name does not fit. */
function versionOf(fileName) {
  const m = /^Qompta-(\d+\.\d+\.\d+)-setup\.exe$/.exec(fileName);
  return m ? m[1] : null;
}

/**
 * URL of the project's GitLab API, derived from the git remote.
 * `git@gitlab.gerber.home:qwasar/qompta.git` -> `https://gitlab.gerber.home/api/v4/projects/qwasar%2Fqompta`
 */
function apiBase() {
  if (process.env.CI_API_V4_URL && process.env.CI_PROJECT_ID) {
    return `${process.env.CI_API_V4_URL}/projects/${encodeURIComponent(process.env.CI_PROJECT_ID)}`;
  }
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const m = /^(?:git@|https?:\/\/)([^:/]+)[:/](.+?)(?:\.git)?$/.exec(remote);
    if (!m) return null;
    return `https://${m[1]}/api/v4/projects/${encodeURIComponent(m[2])}`;
  } catch {
    return null;
  }
}

function token() {
  return process.env.CI_JOB_TOKEN || process.env.GITLAB_TOKEN || null;
}

/**
 * Does the `v<version>` release exist on GitLab?
 * `null` = we could not tell (no token, network unreachable) — when in doubt,
 * the caller archives instead of deleting.
 */
async function releaseExists(v, base, headers) {
  if (!base || !headers) return null;
  try {
    const res = await fetch(`${base}/releases/${encodeURIComponent(`v${v}`)}`, { headers });
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

function archive(fileName) {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  renameSync(join(RELEASE_DIR, fileName), join(ARCHIVE_DIR, fileName));
}

/** The blockmap goes with its installer, whatever the fate of the latter. */
function companions(fileName) {
  return [`${fileName}.blockmap`].filter((f) => existsSync(join(RELEASE_DIR, f)));
}

async function main() {
  if (!existsSync(RELEASE_DIR)) {
    console.log("→ pas de dossier release/, rien à ranger.");
    return;
  }

  const installers = readdirSync(RELEASE_DIR).filter((f) => versionOf(f));
  const stale = installers.filter((f) => versionOf(f) !== version);

  if (stale.length === 0) {
    console.log(`→ release/ ne contient déjà que l'installeur ${version}.`);
    return;
  }

  const base = apiBase();
  const tok = token();
  const headers = tok
    ? process.env.CI_JOB_TOKEN
      ? { "JOB-TOKEN": tok }
      : { "PRIVATE-TOKEN": tok }
    : null;
  if (!headers) {
    console.log("→ aucun jeton GitLab (GITLAB_TOKEN / CI_JOB_TOKEN) : archivage sans suppression.");
  }

  let removed = 0;
  let archived = 0;

  for (const file of stale) {
    const v = versionOf(file);
    const published = await releaseExists(v, base, headers);

    if (published === true) {
      for (const f of [file, ...companions(file)]) rmSync(join(RELEASE_DIR, f));
      console.log(`✓ ${file} supprimé (release v${v} publiée sur GitLab).`);
      removed++;
    } else {
      for (const f of [file, ...companions(file)]) archive(f);
      const why = published === false ? `release v${v} absente de GitLab` : "vérification impossible";
      console.log(`→ ${file} déplacé dans ${ARCHIVE_DIR}/ (${why}).`);
      archived++;
    }
  }

  console.log(
    `→ Ménage terminé : ${removed} supprimé(s), ${archived} archivé(s). ` +
      `Reste à la racine : Qompta-${version}-setup.exe`,
  );
}

await main().catch((err) => {
  // Housekeeping must never fail a build that did produce its installer.
  console.error(`✗ Ménage de release/ interrompu : ${err?.message ?? err}`);
  process.exit(0);
});
