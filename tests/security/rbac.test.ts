import { describe, expect, it } from "vitest";
import { hasAnyRole, canChangeAccountStatus } from "@/lib/security/rbac";
import { OPERATOR_ROLES } from "@/lib/security/apiGuards";
import type { ArgusRole, RbacUser } from "@/types/rbac";

/**
 * ARGUS Prompt 20 — converted from `src/lib/security/__tests__/rbac.test.ts`
 * (a `runRbacAccountStatusGuardTest()` export that Vitest never ran — this
 * repo's `vitest.config.ts` only includes `tests/**`). Every assertion below
 * is preserved from the original; the only functional change is importing
 * `OPERATOR_ROLES` directly from `apiGuards.ts` (newly exported for this
 * purpose) instead of maintaining a hand-mirrored `OPERATOR_GUARD_ROLES`
 * copy that could silently drift from the real guard.
 */

function userWithRole(role: ArgusRole, id = "actor-1"): RbacUser {
  return { id, role };
}

describe("hasAnyRole against the real requireOperator() role set", () => {
  it("P0-1: CITIZEN is denied", () => {
    expect(hasAnyRole(userWithRole("CITIZEN"), OPERATOR_ROLES)).toBe(false);
  });

  it("P0-1: no session (null) is denied", () => {
    expect(hasAnyRole(null, OPERATOR_ROLES)).toBe(false);
  });

  it("P0-1: OPERATOR is allowed", () => {
    expect(hasAnyRole(userWithRole("OPERATOR"), OPERATOR_ROLES)).toBe(true);
  });

  it("P0-1: ANALYST is allowed", () => {
    expect(hasAnyRole(userWithRole("ANALYST"), OPERATOR_ROLES)).toBe(true);
  });

  it("P0-1: ADMIN is allowed", () => {
    expect(hasAnyRole(userWithRole("ADMIN"), OPERATOR_ROLES)).toBe(true);
  });
});

describe("canChangeAccountStatus — stricter than requireOperator(): ADMIN+ only", () => {
  const target = { id: "target-1", role: "CITIZEN" as ArgusRole };
  const superAdminTarget = { id: "target-2", role: "SUPER_ADMIN" as ArgusRole };

  it("P0-2: OPERATOR cannot change account status", () => {
    expect(canChangeAccountStatus(userWithRole("OPERATOR"), target).allowed).toBe(false);
  });

  it("P0-2: ANALYST cannot change account status", () => {
    expect(canChangeAccountStatus(userWithRole("ANALYST"), target).allowed).toBe(false);
  });

  it("P0-2: ADMIN can change a CITIZEN's account status", () => {
    expect(canChangeAccountStatus(userWithRole("ADMIN"), target).allowed).toBe(true);
  });

  it("P0-2: SUPER_ADMIN can change a CITIZEN's account status", () => {
    expect(canChangeAccountStatus(userWithRole("SUPER_ADMIN"), target).allowed).toBe(true);
  });

  it("P0-2: ADMIN cannot touch a SUPER_ADMIN target", () => {
    expect(canChangeAccountStatus(userWithRole("ADMIN"), superAdminTarget).allowed).toBe(false);
  });

  it("P0-2: SUPER_ADMIN can touch another SUPER_ADMIN target", () => {
    expect(canChangeAccountStatus(userWithRole("SUPER_ADMIN"), superAdminTarget).allowed).toBe(true);
  });
});
