import { hasAnyRole, canChangeAccountStatus } from "@/lib/security/rbac";
import type { ArgusRole, RbacUser } from "@/types/rbac";

function userWithRole(role: ArgusRole, id = "actor-1"): RbacUser {
  return { id, role };
}

/**
 * `requireOperator()`/`requireAdmin()` (src/lib/security/apiGuards.ts:28-34)
 * aren't directly unit-testable here — they call `getCurrentUser()`, which
 * reads the session cookie and hits Prisma, and this repo has no test
 * runner/mocking harness yet (that's a separate, larger piece of work, not
 * part of this fix). What IS directly testable, and is the actual
 * authorization decision those guards make once a session resolves, is
 * `hasAnyRole` against the same role sets — this test mirrors
 * `requireOperator`'s exact role array so a regression there (e.g.
 * accidentally dropping ADMIN, or widening it to CITIZEN) is caught.
 */
const OPERATOR_GUARD_ROLES: ArgusRole[] = ["OPERATOR", "ANALYST", "ADMIN", "SUPER_ADMIN"];

export function runRbacAccountStatusGuardTest() {
  // --- P0-1: role set backing the Knowledge Intake review endpoints' guard ---
  const citizenDenied = !hasAnyRole(userWithRole("CITIZEN"), OPERATOR_GUARD_ROLES);
  const publicDenied = !hasAnyRole(null, OPERATOR_GUARD_ROLES);
  const operatorAllowed = hasAnyRole(userWithRole("OPERATOR"), OPERATOR_GUARD_ROLES);
  const analystAllowed = hasAnyRole(userWithRole("ANALYST"), OPERATOR_GUARD_ROLES);
  const adminAllowed = hasAnyRole(userWithRole("ADMIN"), OPERATOR_GUARD_ROLES);

  // --- P0-2: accountStatus changes require ADMIN+, unlike plain requireOperator() ---
  const target = { id: "target-1", role: "CITIZEN" as ArgusRole };
  const superAdminTarget = { id: "target-2", role: "SUPER_ADMIN" as ArgusRole };

  const operatorCannotBan = !canChangeAccountStatus(userWithRole("OPERATOR"), target).allowed;
  const analystCannotBan = !canChangeAccountStatus(userWithRole("ANALYST"), target).allowed;
  const adminCanBan = canChangeAccountStatus(userWithRole("ADMIN"), target).allowed;
  const superAdminCanBan = canChangeAccountStatus(userWithRole("SUPER_ADMIN"), target).allowed;
  const adminCannotTouchSuperAdmin = !canChangeAccountStatus(userWithRole("ADMIN"), superAdminTarget).allowed;
  const superAdminCanTouchSuperAdmin = canChangeAccountStatus(userWithRole("SUPER_ADMIN"), superAdminTarget).allowed;

  return {
    passed:
      citizenDenied &&
      publicDenied &&
      operatorAllowed &&
      analystAllowed &&
      adminAllowed &&
      operatorCannotBan &&
      analystCannotBan &&
      adminCanBan &&
      superAdminCanBan &&
      adminCannotTouchSuperAdmin &&
      superAdminCanTouchSuperAdmin,
    citizenDenied,
    publicDenied,
    operatorAllowed,
    analystAllowed,
    adminAllowed,
    operatorCannotBan,
    analystCannotBan,
    adminCanBan,
    superAdminCanBan,
    adminCannotTouchSuperAdmin,
    superAdminCanTouchSuperAdmin,
  };
}
