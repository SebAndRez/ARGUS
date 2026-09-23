import { describe, expect, it } from "vitest";
import {
  TARGET_MIGRATION_FLAG_DEFAULTS,
  getTargetMigrationFlags,
  isDualReadEnabled,
  isShadowWriteEnabled,
  isTargetMigrationFlagEnabled,
  isTargetReadAllowed,
} from "../../src/lib/database-target/flags/targetMigrationFlags";

describe("targetMigrationFlags defaults", () => {
  it("all 4 flags default to false with an empty env", () => {
    expect(getTargetMigrationFlags({})).toEqual(TARGET_MIGRATION_FLAG_DEFAULTS);
  });

  it("all 4 flags default to false", () => {
    expect(TARGET_MIGRATION_FLAG_DEFAULTS).toEqual({
      targetDatabaseRead: false,
      targetDatabaseShadowWrite: false,
      targetDatabaseDualRead: false,
      targetDatabaseCutover: false,
    });
  });

  it("only the exact string 'true' enables a flag — fails closed on typos", () => {
    const env = {
      ARGUS_TARGET_DB_READ_ENABLED: "1",
      ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED: "TRUE",
      ARGUS_TARGET_DB_DUAL_READ_ENABLED: "yes",
    };
    expect(getTargetMigrationFlags(env)).toEqual(TARGET_MIGRATION_FLAG_DEFAULTS);
  });

  it("enables a flag when its env var is exactly 'true'", () => {
    const flags = getTargetMigrationFlags({ ARGUS_TARGET_DB_READ_ENABLED: "true" });
    expect(flags.targetDatabaseRead).toBe(true);
    expect(flags.targetDatabaseShadowWrite).toBe(false);
  });

  it("isTargetMigrationFlagEnabled reads a single flag", () => {
    expect(isTargetMigrationFlagEnabled("targetDatabaseDualRead", { ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true" })).toBe(
      true
    );
    expect(isTargetMigrationFlagEnabled("targetDatabaseDualRead", {})).toBe(false);
  });
});

/**
 * Paso 5 flag semantics. The helpers exist so no call site re-derives these
 * rules (and gets them subtly wrong): in particular dual-read needs the READ
 * flag too, because comparing legacy against target IS a target read.
 */
describe("flag semantics helpers", () => {
  it("shadow-write is independent of the read flag", () => {
    expect(isShadowWriteEnabled({ ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED: "true" })).toBe(true);
    expect(isShadowWriteEnabled({ ARGUS_TARGET_DB_READ_ENABLED: "true" })).toBe(false);
  });

  it("dual-read requires BOTH its own flag and the read flag — fails closed", () => {
    expect(isDualReadEnabled({ ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true" })).toBe(false);
    expect(isDualReadEnabled({ ARGUS_TARGET_DB_READ_ENABLED: "true" })).toBe(false);
    expect(
      isDualReadEnabled({ ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true", ARGUS_TARGET_DB_READ_ENABLED: "true" })
    ).toBe(true);
  });

  it("every helper is false with an empty env (nothing is enabled by default)", () => {
    expect(isTargetReadAllowed({})).toBe(false);
    expect(isShadowWriteEnabled({})).toBe(false);
    expect(isDualReadEnabled({})).toBe(false);
  });

  it("the flags module exposes no way to resolve the cutover flag — that lives behind the gates", async () => {
    const mod = await import("../../src/lib/database-target/flags/targetMigrationFlags");
    // Reading the raw flag is still possible (getTargetMigrationFlags), but no
    // helper here turns it into a decision: resolveCutoverFlag/
    // resolveSourceOfTruth live in cutover/cutoverGuards.ts, which requires
    // evidence for every gate.
    expect(Object.keys(mod)).not.toContain("resolveCutoverFlag");
    expect(Object.keys(mod)).not.toContain("assertCutoverAllowed");
  });
});
