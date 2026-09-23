/**
 * src/lib/database-target/flags/targetMigrationFlags.ts
 *
 * The 4 application-level feature flags that gate every runtime interaction
 * with the target database migration (Executable Migration Plan, Fase 5).
 * There is no pre-existing feature-flag system in this repo (checked: no
 * `featureFlag`/`FeatureFlag` symbol anywhere under `src/`) — this is the
 * first and only one; do not add a second parallel mechanism.
 *
 * All 4 flags default to `false`. In current production, all 4 MUST remain
 * `false` — nothing here is wired into any request path yet.
 */

export type TargetMigrationFlagName =
  | "targetDatabaseRead"
  | "targetDatabaseShadowWrite"
  | "targetDatabaseDualRead"
  | "targetDatabaseCutover";

export type TargetMigrationFlags = Record<TargetMigrationFlagName, boolean>;

const ENV_VAR_BY_FLAG: Record<TargetMigrationFlagName, string> = {
  targetDatabaseRead: "ARGUS_TARGET_DB_READ_ENABLED",
  targetDatabaseShadowWrite: "ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED",
  targetDatabaseDualRead: "ARGUS_TARGET_DB_DUAL_READ_ENABLED",
  targetDatabaseCutover: "ARGUS_TARGET_DB_CUTOVER_ENABLED",
};

export const TARGET_MIGRATION_FLAG_DEFAULTS: TargetMigrationFlags = {
  targetDatabaseRead: false,
  targetDatabaseShadowWrite: false,
  targetDatabaseDualRead: false,
  targetDatabaseCutover: false,
};

/** Loose env shape (not `NodeJS.ProcessEnv`, which this Next.js project's global types require `NODE_ENV` on) — any string-keyed lookup works, including a bare `{}` in tests. */
export type FlagEnvSource = Record<string, string | undefined>;

function readBooleanEnv(varName: string, env: FlagEnvSource): boolean {
  return env[varName] === "true";
}

/**
 * Resolves the 4 flags from `env` (defaults to `process.env`). Any value
 * other than the exact string `"true"` resolves to `false` — never throws,
 * never silently reinterprets `"1"`/`"TRUE"`/etc. as enabled, so a typo in
 * an env file fails closed rather than silently enabling a migration path.
 */
export function getTargetMigrationFlags(env: FlagEnvSource = process.env): TargetMigrationFlags {
  return {
    targetDatabaseRead: readBooleanEnv(ENV_VAR_BY_FLAG.targetDatabaseRead, env),
    targetDatabaseShadowWrite: readBooleanEnv(ENV_VAR_BY_FLAG.targetDatabaseShadowWrite, env),
    targetDatabaseDualRead: readBooleanEnv(ENV_VAR_BY_FLAG.targetDatabaseDualRead, env),
    targetDatabaseCutover: readBooleanEnv(ENV_VAR_BY_FLAG.targetDatabaseCutover, env),
  };
}

export function isTargetMigrationFlagEnabled(
  flag: TargetMigrationFlagName,
  env: FlagEnvSource = process.env
): boolean {
  return getTargetMigrationFlags(env)[flag];
}

/**
 * What each flag is allowed to mean (Paso 5 — the semantics the guards and
 * the call sites both rely on):
 *
 *   * OFF means ZERO target access. Every entry point checks its flag before
 *     importing the target client module, so "off" is not "connect and do
 *     nothing" — nothing connects at all.
 *   * `targetDatabaseRead` gates any read of the target. Dual-read is a read,
 *     so it requires this flag AS WELL as its own (fail closed: either off =
 *     no target access).
 *   * `targetDatabaseShadowWrite` gates writing the target in parallel. It
 *     can never change what the caller returns: the legacy write has already
 *     committed and the shadow result is a separate value
 *     (`shadow-write/legacyShadowSync.ts`).
 *   * `targetDatabaseDualRead` gates comparing legacy against target. It
 *     changes no user-visible behavior: the response is the legacy one, and
 *     the comparison is only logged/metric'd.
 *   * `targetDatabaseCutover` is NOT resolved here. It lives behind
 *     `cutover/cutoverGuards.ts` (`resolveCutoverFlag` /
 *     `resolveSourceOfTruth`), which requires the env flag AND every gate's
 *     evidence. Reading the raw flag from `getTargetMigrationFlags()` and
 *     acting on it would bypass those gates, which is exactly what the
 *     previous 5-boolean checklist made too easy.
 */
export function isTargetReadAllowed(env: FlagEnvSource = process.env): boolean {
  return isTargetMigrationFlagEnabled("targetDatabaseRead", env);
}

export function isShadowWriteEnabled(env: FlagEnvSource = process.env): boolean {
  return isTargetMigrationFlagEnabled("targetDatabaseShadowWrite", env);
}

/** Dual-read requires BOTH its own flag and the read flag — fail closed. */
export function isDualReadEnabled(env: FlagEnvSource = process.env): boolean {
  return (
    isTargetMigrationFlagEnabled("targetDatabaseDualRead", env) &&
    isTargetMigrationFlagEnabled("targetDatabaseRead", env)
  );
}
