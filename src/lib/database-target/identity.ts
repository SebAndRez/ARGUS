/**
 * src/lib/database-target/identity.ts
 *
 * Target-schema types for BC 1 (Identidad y Confianza), schema `identity`.
 * Mirrors `identity.people` and `identity.user_accounts` as documented in
 * `ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md` §identity (unchanged in v1.1).
 *
 * Current model these replace conceptually: `User` (33-model schema),
 * split per the Compatibility Layer Plan §1 and frozen decision D-01 —
 * `identity.people`/`identity.user_accounts` may validly exist with zero
 * rows in `institution.institutional_memberships` (no synthetic
 * organization is ever created to absorb unassigned legacy users).
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { InformationClassification, LegacyProvenance } from "./shared";

/** `identity.people` — a real human being within ARGUS, independent of whether they hold an account. */
export interface Person extends Partial<LegacyProvenance> {
  /** db: id — uuid PK (UUIDv7 per catalog convention) */
  id: string;
  /** db: legal_name — varchar(255) NOT NULL */
  legalName: string;
  /** db: display_alias — varchar(100) NOT NULL */
  displayAlias: string;
  /** db: national_id_hash — text NULL UNIQUE (hash, never plaintext) */
  nationalIdHash: string | null;
  /** db: date_of_birth — date NULL */
  dateOfBirth: string | null;
  /** db: contact_info — jsonb NULL */
  contactInfo: Record<string, unknown> | null;
  /** db: classification — information_classification_enum NOT NULL DEFAULT 'OPERATIONAL' */
  classification: InformationClassification;
  /** db: created_at */
  createdAt: string;
  /** db: updated_at */
  updatedAt: string;
  /** db: deleted_at */
  deletedAt: string | null;
  /**
   * Derived, not a physical column (per D-01 criterio de cierre):
   * `NOT EXISTS (SELECT 1 FROM institution.institutional_memberships
   *   WHERE person_id = people.id AND effective_to IS NULL)`.
   * A person may legitimately be UNASSIGNED indefinitely — this is not an
   * error state, and no RLS policy may treat it as implicit institutional
   * membership (D-01 mitigation).
   */
  institutionAssignmentStatus?: "ASSIGNED" | "UNASSIGNED";
}

/** `user_account_status_enum` observed values (identity.user_accounts.status). */
export type UserAccountStatus =
  | "ACTIVE"
  | "SUSPENDED"
  | "BLOCKED"
  | "PENDING"
  | "REVOKED"
  | "SOFT_DELETED";

/** `identity.user_accounts` — the digital access mechanism for a Person. */
export interface UserAccount extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: person_id — uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT */
  personId: string;
  /** db: status — user_account_status_enum NOT NULL DEFAULT 'PENDING' */
  status: UserAccountStatus;
  /** db: auth_provider — varchar(50) NULL */
  authProvider: string | null;
  /** db: last_login_at */
  lastLoginAt: string | null;
  /** db: created_at */
  createdAt: string;
  /** db: updated_at */
  updatedAt: string;
  /** db: deleted_at */
  deletedAt: string | null;
}

/** `verified_identity_status_enum` (identity.verified_identities.status). */
export type VerifiedIdentityStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED"
  | "SUSPENDED"
  | "REVOKED";

/** `identity.verified_identities` — result of civil identity verification. No current-schema equivalent (AUSENTE per mapping doc). */
export interface VerifiedIdentity {
  /** db: id */
  id: string;
  /** db: person_id — uuid NOT NULL REFERENCES identity.people(id) */
  personId: string;
  /** db: document_type — varchar(50) NOT NULL */
  documentType: string;
  /** db: document_country — varchar(2) NOT NULL */
  documentCountry: string;
  /** db: document_identifier — text NOT NULL */
  documentIdentifier: string;
  /** db: status */
  status: VerifiedIdentityStatus;
  /** db: verified_at */
  verifiedAt: string | null;
  /** db: expires_at */
  expiresAt: string | null;
  /** db: created_at */
  createdAt: string;
}

/**
 * Compatibility DTO shape — what a `User`-shaped consumer (legacy
 * `apiGuards.ts`, `authService.ts`) expects while the dual-write/dual-read
 * transition (Compatibility Layer Plan §4, Ola 2) is in flight. This is the
 * shape a future `compat.v_user_as_target` view or repository adapter would
 * serve — never a physical table itself.
 */
export interface LegacyUserCompatView {
  id: string;
  person: Person;
  account: UserAccount;
}
