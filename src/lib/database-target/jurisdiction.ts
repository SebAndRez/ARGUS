/**
 * src/lib/database-target/jurisdiction.ts
 *
 * Target-schema types for the `governance.jurisdictions` /
 * `governance.jurisdiction_scopes` pair, schema `governance`. Mirrors
 * `prisma/schema.target.prisma` models `Jurisdiction`/`JurisdictionScope`
 * (lines ~4223-4266).
 *
 * Current model this replaces: NONE — the current 33-model schema has no
 * concept of a legally-scoped jurisdiction; this is a new governance
 * primitive introduced by the target model (Ola 0/1, `000_preflight`/
 * `010_foundation`). `JurisdictionScope` is the polymorphic "which entities
 * does this jurisdiction apply to" association — `scopedTable`/`scopedId`
 * is discriminated, never a real physical FK.
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { ActorType } from "./shared";

/** `jurisdiction_scope_role_enum`. */
export type JurisdictionScopeRole = "PRIMARY" | "SECONDARY" | "SUPPORTING" | "NOTIFIED";

/**
 * `governance.jurisdictions` — a versioned, approvable legal/administrative
 * scope declaration. `declaringOrganizationId` is optional — a jurisdiction
 * may exist (e.g. a default civil-protection boundary) without having been
 * declared by any registered `institution.organizations` row.
 */
export interface Jurisdiction {
  /** db: id — uuid PK */
  id: string;
  /** db: name — varchar(255) NOT NULL */
  name: string;
  /** db: primary_administrative_area_id — uuid NOT NULL REFERENCES geo.administrative_areas(id) ON DELETE RESTRICT */
  primaryAdministrativeAreaId: string;
  /** db: declaring_organization_id — uuid NULL REFERENCES institution.organizations(id) ON DELETE SET NULL */
  declaringOrganizationId: string | null;
  /** db: legal_basis — text NULL */
  legalBasis: string | null;
  /** db: approved_by_actor_type — actor_type_enum NULL [NUEVO v1.1 — P2-07, every versioned Configuration Entity has an approver] */
  approvedByActorType: ActorType | null;
  /** db: approved_by_actor_id — uuid NULL (POLYMORPHIC Actor reference, no physical FK) */
  approvedByActorId: string | null;
  /** db: version — integer NOT NULL DEFAULT 1 */
  version: number;
  /** db: effective_from */
  effectiveFrom: string;
  /** db: effective_to — NULL while current */
  effectiveTo: string | null;
}

/**
 * `governance.jurisdiction_scopes` — polymorphic "this jurisdiction applies
 * to entity X" association. `scopedTable` is validated at the SQL layer
 * against an allowlist (`ck_jurisdiction_scopes_table_whitelist`) — an
 * adapter must never construct one against an arbitrary table name.
 */
export interface JurisdictionScope {
  /** db: id */
  id: string;
  /** db: jurisdiction_id — uuid NOT NULL REFERENCES governance.jurisdictions(id) ON DELETE RESTRICT */
  jurisdictionId: string;
  /** db: scoped_table — varchar(50) NOT NULL (allowlisted physical table name) */
  scopedTable: string;
  /** db: scoped_id — uuid NOT NULL (POLYMORPHIC, discriminated by scopedTable, no physical FK) */
  scopedId: string;
  /** db: scope_role */
  scopeRole: JurisdictionScopeRole;
}
