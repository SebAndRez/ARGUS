import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    ".vercel/output/**",
    "out/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // Internal docs/snapshots (mostly gitignored) and rehearsal outputs are not app code.
    "docs/**",
    "migration-rehearsal-artifacts/**",
    "migration-rehearsal-logs/**",
  ]),
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
