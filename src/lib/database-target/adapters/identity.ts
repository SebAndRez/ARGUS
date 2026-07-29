/**
 * src/lib/database-target/adapters/identity.ts
 *
 * Functional compatibility adapter for BC 1 (Identidad), current `User` ->
 * target `identity.people` + `identity.user_accounts` (Ola 2, D-01). Not
 * wired into `src/lib/auth/*` — isolated, tested in isolation, gated by
 * `targetDatabaseShadowWrite`.
 */

import type { Person, UserAccount } from "../identity";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  notEnabled,
} from "./types";

/** 1. Current-read interface — the exact subset of `User` (prisma/schema.prisma) this adapter touches. */
export interface LegacyUserRecord {
  id: string;
  name: string;
  publicAlias: string;
  governmentIdHash: string | null;
  authProvider: string | null;
  accountStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 2. Target-read interface — reuses `identity.ts`'s `Person`/`UserAccount`. */
export interface IdentityTargetPair {
  person: Person;
  account: UserAccount;
}

const ACCOUNT_STATUS_MAP: Record<string, UserAccount["status"]> = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  BLOCKED: "BLOCKED",
  BANNED: "BLOCKED",
  PENDING: "PENDING",
  REVOKED: "REVOKED",
  DELETED: "SOFT_DELETED",
};

/** 3. current -> target transform. Never assigns an `institution.institutional_memberships` row (D-01) — `institutionAssignmentStatus` is always `UNASSIGNED` at backfill time. */
export function userToIdentityTarget(user: LegacyUserRecord): IdentityTargetPair {
  const person: Person = {
    id: user.id,
    legalName: user.name,
    displayAlias: user.publicAlias,
    nationalIdHash: user.governmentIdHash,
    dateOfBirth: null,
    contactInfo: null,
    classification: "OPERATIONAL",
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: null,
    institutionAssignmentStatus: "UNASSIGNED",
    legacyStatus: user.accountStatus,
    legacySource: "User",
    legacyRecordId: user.id,
    migrationConfidence: "HIGH",
    migrationReviewStatus: "AUTO_MAPPED",
  };

  const account: UserAccount = {
    id: user.id,
    personId: user.id,
    status: ACCOUNT_STATUS_MAP[user.accountStatus] ?? "PENDING",
    authProvider: user.authProvider,
    lastLoginAt: null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: null,
    legacyStatus: user.accountStatus,
    legacySource: "User",
    legacyRecordId: user.id,
    migrationConfidence: ACCOUNT_STATUS_MAP[user.accountStatus] ? "HIGH" : "MEDIUM",
    migrationReviewStatus: ACCOUNT_STATUS_MAP[user.accountStatus] ? "AUTO_MAPPED" : "REQUIRES_REVIEW",
  };

  return { person, account };
}

/** 4. target -> legacy-payload transform — the `User`-compatible DTO shape consumers of `apiGuards.ts`/`authService.ts` still expect during the transition (see `LegacyUserCompatView` in identity.ts). */
export function identityTargetToLegacyPayload(pair: IdentityTargetPair): {
  id: string;
  name: string;
  publicAlias: string;
  accountStatus: string;
} {
  const REVERSE_STATUS_MAP: Record<UserAccount["status"], string> = {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    BLOCKED: "BLOCKED",
    PENDING: "PENDING",
    REVOKED: "REVOKED",
    SOFT_DELETED: "DELETED",
  };
  return {
    id: pair.person.id,
    name: pair.person.legalName,
    publicAlias: pair.person.displayAlias,
    accountStatus: REVERSE_STATUS_MAP[pair.account.status],
  };
}

/** 5-9. Shadow write — explicit NOT_ENABLED when the flag is off; never a fake success. */
export function shadowWriteIdentity(
  user: LegacyUserRecord,
  ctx: AdapterWriteContext
): AdapterOutcome<IdentityTargetPair> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — identity shadow write not attempted");
  }
  if (!user.id) {
    return migrationBlocked("LegacyUserRecord.id is required to derive both people.id and user_accounts.id");
  }
  const target = userToIdentityTarget(user);
  return {
    kind: "PERSISTED",
    target,
    legacyId: user.id,
    migrationConfidence: target.person.migrationConfidence ?? "HIGH",
    reviewStatus: target.person.migrationReviewStatus ?? "AUTO_MAPPED",
  };
}
