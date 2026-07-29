/**
 * src/lib/database-target/mission.ts
 *
 * Target-schema types for BC 10 (Despacho Operacional / Misiones), schema
 * `mission`. Mirrors `prisma/schema.target.prisma` models `Mission`/
 * `MissionAssignment` (lines ~2750-2810), 2 of the 10 `mission.*` tables.
 *
 * Current model this replaces: NONE — `mission.*` is a completely new
 * domain (CREATE_EMPTY across all 10 tables per the Executable Migration
 * Plan Ola 5). `src/modules/fenix/*` plans dispatch today without
 * persisting it; this schema is what gives that planning a durable home,
 * implemented forward-only, never backfilled from a legacy table.
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { InformationClassification, OfflineSyncColumns } from "./shared";

/** `mission_status_enum` (default 'CREATED'). */
export type MissionStatus =
  | "CREATED"
  | "PENDING_ASSIGNMENT"
  | "OFFERED"
  | "ACCEPTED"
  | "ASSIGNED"
  | "EN_ROUTE"
  | "ON_SITE"
  | "IN_PROGRESS"
  | "PAUSED"
  | "AWAITING_SUPPORT"
  | "REASSIGNING"
  | "COMPLETED"
  | "FAILED";

/** Contract VO MissionObjective — {mission_kind, success_criteria, constraints?}. Validated by `fn_validate_jsonb_shape('mission_objective', ...)` (SQL_COMPLEMENTARY_REQUIRED, P2-03). */
export interface MissionObjective {
  missionKind: string;
  successCriteria: string[];
  constraints?: Record<string, unknown>;
}

/**
 * `mission.missions` — the operational dispatch aggregate root. Always
 * originates from a `help.operational_needs` row — never created
 * standalone.
 */
export interface Mission {
  /** db: id — uuid PK */
  id: string;
  /** db: operational_need_id — uuid NOT NULL REFERENCES help.operational_needs(id) ON DELETE RESTRICT */
  operationalNeedId: string;
  /** db: status — DEFAULT 'CREATED' */
  status: MissionStatus;
  /** db: classification — DEFAULT 'CRITICAL' */
  classification: InformationClassification;
  /** db: objective — jsonb NOT NULL, contract MissionObjective */
  objective: MissionObjective;
  /** db: objective_schema_version — integer NOT NULL DEFAULT 1 */
  objectiveSchemaVersion: number;
  /** db: created_at */
  createdAt: string;
  /** db: closed_at */
  closedAt: string | null;
}

/** `assignee_type_enum` — polymorphic discriminator, no physical FK. */
export type AssigneeType = "OPERATIONAL_UNIT" | "PERSON";

/** `assignment_kind_enum`. */
export type AssignmentKind = "PRINCIPAL" | "SUPPORT";

/** `assignment_status_enum` (default 'OFFERED'). */
export type AssignmentStatus = "OFFERED" | "ACCEPTED" | "ASSIGNED" | "REASSIGNED";

/**
 * `mission.mission_assignments` — formal Mission<->responsible relationship
 * (polymorphic assignee: `resource.operational_units` | `identity.people`,
 * discriminated by `assigneeType`, no physical FK).
 */
export interface MissionAssignment extends Partial<OfflineSyncColumns> {
  /** db: id */
  id: string;
  /** db: mission_id — uuid NOT NULL REFERENCES mission.missions(id) ON DELETE CASCADE */
  missionId: string;
  /** db: assignee_type */
  assigneeType: AssigneeType;
  /** db: assignee_id — uuid NOT NULL (POLYMORPHIC, discriminated by assigneeType) */
  assigneeId: string;
  /** db: role_title — varchar(100) NOT NULL */
  roleTitle: string;
  /** db: kind */
  kind: AssignmentKind;
  /** db: status — DEFAULT 'OFFERED' */
  status: AssignmentStatus;
  /** db: created_at */
  createdAt: string;
}
