/**
 * src/lib/database-target/governance.ts
 *
 * Target-schema types for `governance.automation_rules` and
 * `governance.automation_rule_incident_types`, as applied by
 * `prisma/target-migrations/010_foundation/migration.sql`. Only the
 * fields the wave-4 automated-promotion path actually reads are modeled
 * here — this is not a full governance-schema mirror.
 *
 * NOT a Prisma client. NOT imported by any existing runtime code.
 */

/** `governance.rule_status_enum` — shared by `operational_rules` and `automation_rules`. */
export type RuleStatus = "PROPOSED" | "APPROVED" | "ACTIVE" | "DEPRECATED";

/**
 * `governance.automation_rules` — a rule an automated actor can cite as its
 * authority to promote an `IncidentCandidate` without a human decider. Never
 * enough on its own: the wave-4 mandate additionally requires the rule to be
 * linked (via `AutomationRuleIncidentType`) to the candidate's proposed
 * incident type, and to be within its effective window at decision time.
 */
export interface AutomationRule {
  /** db: id — uuid PK */
  id: string;
  /** db: name — varchar(255) NOT NULL */
  name: string;
  /** db: version — integer NOT NULL DEFAULT 1 */
  version: number;
  /** db: status — DEFAULT 'PROPOSED'; only 'APPROVED' or 'ACTIVE' authorize automated promotion. */
  status: RuleStatus;
  /** db: confidence_threshold — numeric(5,2) NULL; when set, the candidate's proposedProfile.confidence must meet or exceed it. */
  confidenceThreshold: number | null;
  /** db: required_corroboration_count — smallint NULL; when set, the candidate must have at least this many linked observations. */
  requiredCorroborationCount: number | null;
  /** db: effective_from */
  effectiveFrom: string;
  /** db: effective_to — NULL means no expiry. */
  effectiveTo: string | null;
}

/** `governance.automation_rule_incident_types` — N:M join, PK (automation_rule_id, incident_type_id). */
export interface AutomationRuleIncidentType {
  automationRuleId: string;
  incidentTypeId: string;
}
