#!/usr/bin/env node
/**
 * PostToolUse guard (Bash): after a real `git commit`, restarts the app if the
 * version changed (the script called does the --if-version-changed check itself).
 * As with the refusal guard, the filtering is done on the actual command read on
 * stdin, so as not to trigger a restart after just any command.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

let cmd = "";
try {
  cmd = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "";
} catch {
  /* nothing to do */
}

if (/\bgit\s+commit\b/.test(cmd)) {
  spawn("node", ["scripts/restart-app.mjs", "--if-version-changed"], {
    detached: true,
    stdio: "ignore",
  }).unref();
}
