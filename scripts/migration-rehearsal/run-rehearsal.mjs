#!/usr/bin/env node
/**
 * scripts/migration-rehearsal/run-rehearsal.mjs
 *
 * The single canonical entry point for the full local migration rehearsal, so
 * that `npm run db:target:rehearsal` means exactly the same thing on a Windows
 * workstation and on a Linux CI runner.
 *
 * Before this, the npm script hardcoded `powershell`, which does not exist on
 * ubuntu-latest — so `npm run db:target:ci` (validate + target tests +
 * rehearsal) could not actually be used by the workflow, and CI had to invoke
 * the .ps1 a second, separate way. Duplicating the invocation is how the two
 * drift apart.
 *
 * Resolution order is `pwsh` (PowerShell 7, present on GitHub runners) then
 * `powershell` (Windows PowerShell 5.1). The harness is written to run under
 * both. A missing interpreter is a hard failure — never a skip.
 *
 * The child's exit code is propagated verbatim: this launcher must not be able
 * to turn a red rehearsal green.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "Invoke-ArgusFullRehearsal.ps1");
const forwarded = process.argv.slice(2);

function resolveInterpreter() {
  for (const candidate of ["pwsh", "powershell"]) {
    const probe = spawnSync(candidate, ["-NoProfile", "-Command", "exit 0"], {
      stdio: "ignore",
      shell: false,
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

const interpreter = resolveInterpreter();
if (!interpreter) {
  process.stderr.write(
    "REHEARSAL_INTERPRETER_MISSING - neither 'pwsh' nor 'powershell' is available on PATH. " +
      "The migration rehearsal cannot run. Install PowerShell 7 (pwsh) and re-run.\n"
  );
  process.exit(1);
}

const result = spawnSync(
  interpreter,
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...forwarded],
  { stdio: "inherit", shell: false }
);

if (result.error) {
  process.stderr.write(`REHEARSAL_LAUNCH_FAILED - ${result.error.message}\n`);
  process.exit(1);
}
if (result.signal) {
  process.stderr.write(`REHEARSAL_TERMINATED - killed by signal ${result.signal}\n`);
  process.exit(1);
}
// `status` is null only when the process never started, which the two branches
// above already cover; treating a null as 0 here would be exactly the kind of
// silently-swallowed failure this change exists to remove.
process.exit(result.status === null ? 1 : result.status);
