#!/usr/bin/env node
/**
 * scripts/migration-rehearsal/lib/harness-fault-command.mjs
 *
 * A stand-in for a test-suite command, used ONLY by the rehearsal harness's own
 * self-test (Test-ArgusFailurePropagation) and by the controlled negative
 * verification run (ARGUS_REHEARSAL_FAULT_PHASE). It exists so that "a failing
 * suite stops the rehearsal" can be demonstrated without ever editing a
 * productive test file to make it fail.
 *
 * It prints output shaped exactly like vitest's terminal summary, because the
 * failure mode being locked out is precisely a command whose output LOOKS green
 * while its exit code is not zero.
 *
 * Modes:
 *   pass     - green summary, exit 0. The positive control: proves the harness
 *              lets a genuinely successful command through.
 *   fail     - green summary and an "ALL GREEN" line, exit 1. Proves the
 *              harness trusts the exit code and not the text.
 *   empty    - zero files, zero tests, exit 0. Proves a suite that collected
 *              nothing is rejected by the coverage gate rather than by the exit
 *              code (nothing failed - nothing ran).
 *   skipped  - every file and every test skipped, exit 0. Proves a phase that
 *              requires real Docker coverage rejects a suite that skipped it
 *              all, which is what happens when the gate variable is missing.
 *
 * There is intentionally no mode that turns a real failure into a pass.
 */

const mode = process.argv[2] ?? "fail";

const MODES = {
  pass: {
    lines: [
      " RUN  v4.1.10 (harness fault fixture)",
      "",
      " ✓ tests/fixture/alpha.test.ts (20)",
      " ✓ tests/fixture/beta.test.ts (20)",
      "",
      " Test Files  2 passed (2)",
      "      Tests  40 passed (40)",
    ],
    exit: 0,
  },
  fail: {
    lines: [
      " RUN  v4.1.10 (harness fault fixture)",
      "",
      " ✓ tests/fixture/alpha.test.ts (20)",
      " ✓ tests/fixture/beta.test.ts (20)",
      "",
      " Test Files  2 passed (2)",
      "      Tests  40 passed (40)",
      "",
      "ALL GREEN - everything passed.",
    ],
    exit: 1,
  },
  empty: {
    lines: [
      " RUN  v4.1.10 (harness fault fixture)",
      "",
      " Test Files  0 passed (0)",
      "      Tests  0 passed (0)",
    ],
    exit: 0,
  },
  skipped: {
    lines: [
      " RUN  v4.1.10 (harness fault fixture)",
      "",
      " ↓ tests/fixture/alpha.test.ts (20) [skipped]",
      " ↓ tests/fixture/beta.test.ts (20) [skipped]",
      "",
      " Test Files  0 passed | 2 skipped (2)",
      "      Tests  0 passed | 40 skipped (40)",
    ],
    exit: 0,
  },
};

const selected = MODES[mode];
if (!selected) {
  process.stderr.write(
    `harness-fault-command.mjs: unknown mode '${mode}'. Expected one of: ${Object.keys(MODES).join(", ")}\n`
  );
  process.exit(2);
}

process.stdout.write(selected.lines.join("\n") + "\n");
process.exit(selected.exit);
