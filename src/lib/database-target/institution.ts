/**
 * src/lib/database-target/institution.ts
 *
 * Target-schema types for BC 2 (Instituciones y Organizaciones), schema
 * `institution`. Mirrors `institution.organizations`,
 * `.organizational_units`, `.institutional_memberships`,
 * `.institutional_credentials` as modeled in `prisma/schema.target.prisma`
 * (models `Organization`/`OrganizationalUnit`/`InstitutionalMembership`/
 * `InstitutionalCredential`, lines ~1449-1537).
 *
 * Current model this replaces: NONE (D-01, frozen decision register) — all
 * 4 tables are `CREATE_EMPTY`. No `Organization`/institution concept exists
 * in the current 33-model schema; `institution.*` is populated only by
 * explicit future administrator action, never by a backfill, and never
 * synthesized to absorb `User` rows left `UNASSIGNED` (see identity.ts).
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { ActorType } from "./shared";

/** `organization_status_enum` (default 'ACTIVE'). */
export type OrganizationStatus = "ACTIVE" | "SUSPENDED" | "DISSOLVED";

/** `institution.organizations` — CREATE_EMPTY (D-01). Never auto-created to hold unassigned users. */
export interface Organization {
  /** db: id — uuid PK */
  id: string;
  /** db: legal_name — varchar(255) NOT NULL */
  legalName: string;
  /** db: registration_identifier — varchar(100) NULL UNIQUE */
  registrationIdentifier: string | null;
  /** db: has_formal_authority — boolean NOT NULL DEFAULT false */
  hasFormalAuthority: boolean;
  /** db: status — DEFAULT 'ACTIVE' */
  status: OrganizationStatus;
  /** db: created_at */
  createdAt: string;
  /** db: updated_at */
  updatedAt: string;
  /** db: deleted_at */
  deletedAt: string | null;
}

/** `organizational_unit_status_enum` (default 'ACTIVE'). */
export type OrganizationalUnitStatus = "ACTIVE" | "DISBANDED";

/** `institution.organizational_units` — internal subdivision of an Organization. Self-referential parent/child, cycle-prevented by trigger. */
export interface OrganizationalUnit {
  /** db: id */
  id: string;
  /** db: organization_id — uuid NOT NULL REFERENCES institution.organizations(id) ON DELETE CASCADE */
  organizationId: string;
  /** db: parent_unit_id — uuid NULL REFERENCES institution.organizational_units(id) ON DELETE RESTRICT */
  parentUnitId: string | null;
  /** db: name — varchar(255) NOT NULL */
  name: string;
  /** db: status — DEFAULT 'ACTIVE' */
  status: OrganizationalUnitStatus;
  /** db: created_at */
  createdAt: string;
}

/** `institutional_membership_status_enum` (default 'ACTIVE'). */
export type InstitutionalMembershipStatus = "ACTIVE" | "SUSPENDED" | "TERMINATED";

/**
 * `institution.institutional_memberships` — the ONLY table that may
 * associate a `Person` with an `Organization`. Per D-01, this table is
 * never populated as a side effect of migrating `User` — it starts and
 * stays empty until an administrator explicitly declares a membership.
 */
export interface InstitutionalMembership {
  /** db: id */
  id: string;
  /** db: person_id — uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT */
  personId: string;
  /** db: organization_id — uuid NOT NULL REFERENCES institution.organizations(id) ON DELETE RESTRICT */
  organizationId: string;
  /** db: organizational_unit_id — uuid NULL REFERENCES institution.organizational_units(id) ON DELETE SET NULL */
  organizationalUnitId: string | null;
  /** db: role_title — varchar(100) NOT NULL */
  roleTitle: string;
  /** db: role_scope — varchar(100) NULL */
  roleScope: string | null;
  /** db: status — DEFAULT 'ACTIVE' */
  status: InstitutionalMembershipStatus;
  /** db: effective_from */
  effectiveFrom: string;
  /** db: effective_to — NULL while the membership is current; partial unique index enforces at most one ACTIVE row per (person_id, organization_id) */
  effectiveTo: string | null;
  /** db: revoked_at */
  revokedAt: string | null;
  /** db: created_at */
  createdAt: string;
}

/** `credential_status_enum` (default 'ACTIVE'). */
export type CredentialStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

/** `institution.institutional_credentials` — evidence of an issued function/role, versioned. */
export interface InstitutionalCredential {
  /** db: id */
  id: string;
  /** db: institutional_membership_id — uuid NOT NULL REFERENCES institution.institutional_memberships(id) ON DELETE CASCADE */
  institutionalMembershipId: string;
  /** db: credential_type — varchar(100) NOT NULL */
  credentialType: string;
  /** db: status — DEFAULT 'ACTIVE' */
  status: CredentialStatus;
  /** db: issued_at */
  issuedAt: string;
  /** db: expires_at */
  expiresAt: string | null;
  /** db: revoked_at */
  revokedAt: string | null;
}

/** Convenience discriminator, never a physical column — used by adapters to record who approved an Organization's formal-authority claim (see the `Organization.hasFormalAuthority` trigger note). */
export interface OrganizationApprovalNote {
  approvedByActorType: ActorType;
  approvedByActorId: string;
}
