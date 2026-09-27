#!/usr/bin/env node
/**
 * PreToolUse guard (Bash): refuses a `git commit` if the package.json version has
 * not changed since HEAD. The check is done HERE, on the actual command read on
 * the hook's stdin, so as to NEVER block another command (typecheck, cat, etc.).
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let cmd = "";
try {
  cmd = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "";
} catch {
  /* no readable payload: let it through */
}

// Only acts on a real git commit.
if (!/\bgit\s+commit\b/.test(cmd)) process.exit(0);

// A commit in the public copy (../qompta-public) has nothing to do with this
// repository's version: the check below would read the wrong package.json.
if (/qompta-public/.test(cmd)) process.exit(0);

// Same for any other repository reached by `cd` before the commit (the website
// qompta.qwasar.ch, for instance): only a commit in THIS repository is checked.
const cdTarget = /(?:^|[;&|]\s*)cd\s+("[^"]+"|'[^']+'|\S+)/.exec(cmd)?.[1]?.replace(/^["']|["']$/g, "");
if (cdTarget && !/\/projets\/qompta\/?$/.test(cdTarget)) process.exit(0);

let cur = null;
let prev = null;
try {
  cur = JSON.parse(readFileSync("package.json", "utf8")).version;
} catch {
  /* no readable package.json: let it through */
}
try {
  prev = JSON.parse(execSync("git show HEAD:package.json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).version;
} catch {
  /* no history: let it through */
}

// A commit that does not touch the app (documentation, agent tooling) deserves
// neither a version nor an installer: Thomas's request (v1.20.1, docs updated afterwards).
const NOT_APP = /^(?:[^/]+\.md|docs\/.*|\.claude\/.*|scripts\/hooks\/.*)$/;
let staged = [];
try {
  staged = execSync("git diff --cached --name-only", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .filter(Boolean);
} catch {
  /* unreadable index: apply the normal rule */
}
const docsOnly = staged.length > 0 && staged.every((f) => NOT_APP.test(f)) && !/\s-a\b|--all\b/.test(cmd);

if (cur && cur === prev && !docsOnly) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Version ${cur} inchangée depuis HEAD. Bumper package.json (majeur / mineur / correctif) et les références du README avant de committer : voir la skill version-bump.`,
      },
    }),
  );
}
