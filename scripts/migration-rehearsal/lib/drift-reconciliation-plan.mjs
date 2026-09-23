/**
 * scripts/migration-rehearsal/lib/drift-reconciliation-plan.mjs
 *
 * Paso 6A, point 5: the reconciliation plan for the REAL_DRIFT_TO_RECONCILE
 * class — one decision per divergence, each one citing the document that
 * decides it. Nothing here is a preference: every `FIX_DDL` / `FIX_PRISMA`
 * entry is a divergence where a FROZEN document already says what the shape
 * must be, and every `ESCALATE` entry is one where no frozen document says,
 * so it becomes a named human decision instead of a guess.
 *
 * Why the DDL is usually the side that moves: every wave's `migration.sql`
 * carries its own `VERIFY_AGAINST_V1.0` markers (85 of them across the nine
 * waves) with the explicit note that its column sets were "reconstructed from
 * cross-referenced clues" because `ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md` was
 * not available when the draft was written, and that they must be reconciled
 * against the v1.0 ficha "before this draft is treated as final DDL". That
 * document IS in the repository. This file is that deferred reconciliation.
 *
 * Authorities, in precedence order:
 *   A1  ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md — the 40-field ficha per table
 *       (column set, nullability, defaults, FK on-delete). v1.1 FROZEN defers
 *       identity/institution/capability fichas to it explicitly.
 *   A2  ARGUS_LOGICAL_ENTITY_CATALOG_v1.2_FROZEN.md — entity lifecycles, i.e.
 *       the authoritative STATE LABELS behind each status enum.
 *   A3  ARGUS_PHYSICAL_ENUMS_REFERENCE_DATA_v1.1_FROZEN.md — each enum's
 *       owning schema and value COUNT (it does not list labels).
 *   A4  Applied, load-bearing DDL — a value another wave's CHECK constraint
 *       or function already reads. Postgres enforces it; the model follows it.
 *
 * `ESCALATE` decisions do NOT block shadow-write or dual-read: none of the
 * escalated labels is a value the sync writes or the dual-read compares. They
 * block the drift gate, which is exactly what a gate is for.
 */

/** The four decision directions. */
export const DIRECTIONS = ["FIX_DDL", "FIX_PRISMA", "ESCALATE"];

/**
 * Human decisions this plan OPENS (it resolves none of them). Each one is a
 * vocabulary question that no frozen document answers, on a table that carries
 * no migrated data today.
 */
export const OPENED_DECISIONS = {
  "D-09_GOVERNANCE_CATALOG_STATUS_VOCABULARY":
    "governance.policy_publication_status_enum and governance.territorial_configuration_status_enum have 2 values each with default PUBLISHED/ACTIVE (A3, A1). The second label is a pre-publication lifecycle (DRAFT/INACTIVE, as applied) or a post-publication one (DEPRECATED, as modelled). Both tables are CREATE_EMPTY; no row exists either way.",
  "D-10_TRUST_DOMAIN_VOCABULARY":
    "identity.trust_domain_enum has 8 values (A3). The applied DDL labels itself 'placeholder labels flagged for review'; A1/A2 give reputation bands, not domains. The sync writes only GENERAL, which exists in every candidate set.",
  "D-11_SESSION_END_REASON_VOCABULARY":
    "identity.operational_session_end_reason_enum has 3 values (A3). A2 fixes the STATUS labels (ACTIVE/EXPIRED/ENDED_BY_USER/ENDED_BY_TIMEOUT) but not the reason labels; the open choice is REVOKED (as applied) vs ADMIN_TERMINATED (as modelled).",
  "D-12_CONFIDENCE_LEVEL_TOP_LABEL":
    "evidence.confidence_level_enum has 5 values with default UNKNOWN (A1 §evidence.observations). The top band is VERY_HIGH (as modelled) or CONFIRMED (as applied). ORÁCULO's scoring doc uses numeric scores, not these labels, so neither is implied.",
  "D-14_HELP_REQUEST_LIFECYCLE_ALIGNMENT":
    "help.help_request_status_enum has 12 values on both sides, but they are two different state machines. A2 §HelpRequest row 7 fixes the lifecycle as RECEIVED -> UNDER_ASSESSMENT -> VALIDATED -> LINKED_TO_INCIDENT -> CONVERTED_TO_MISSION -> IN_ATTENTION -> RESOLVED/TRANSFERRED/DUPLICATE/FALSE_ALARM/NO_CONTACT -> CLOSED. The applied set instead carries TRIAGED/ASSIGNED/ESCALATED/ON_HOLD/AWAITING_RESOURCE/PARTIALLY_RESOLVED/CANCELLED. Two legacy states that 25 real rows use today, assigned and cancelled, have NO counterpart in the authoritative set: mapping them would be a judgement about live data, not a rename. Adopting A2 therefore needs a decision about (a) the target labels and (b) where legacy assigned/cancelled land.",
  "D-13_RESOURCE_STATUS_AND_MOVEMENT_VOCABULARY":
    "resource.resource_status_enum (A1 says 'Ver Fase 11 (11 valores)', a section the frozen set does not carry) and resource.inventory_movement_kind_enum (IN/OUT as modelled vs RESTOCK/CONSUMPTION as applied). Wave 060 migrates CriticalPoi into resource.resources with status AVAILABLE only, a value both sets share.",
};

/**
 * One entry per table (or enum) that carries REAL_DRIFT_TO_RECONCILE, keyed by
 * `<wave>|<object>`. `authority` cites the document; `actions` is what the
 * implementation does; `entries` lists the divergence kinds this covers.
 */
export const PLAN = {
  // ---------------------------------------------------------------- wave 010
  "010|governance.resource_type_enum": {
    direction: "FIX_DDL",
    authority: "A3 row 60: resource_type_enum lives in schema `resource`, 6 values",
    actions: [
      "create schema `resource` in 010 (its first user, governance.resource_reservation_rules, lives there) and create resource.resource_type_enum in it",
      "drop the governance-schema copy; 060 keeps using the same type, it no longer creates one",
      "010 rollback drops the type and the schema it created",
    ],
    covers: ["ENUM_EXTRA_IN_DB", "TYPE", "ENUM_MISSING_IN_DB"],
  },
  // The rules table's own column is the third face of the same relocation.
  "010|governance.resource_reservation_rules": {
    direction: "FIX_DDL",
    authority: "A3 row 60 — the column must be typed with resource.resource_type_enum",
    actions: ["retype governance.resource_reservation_rules.resource_type to resource.resource_type_enum"],
    covers: ["TYPE"],
  },
  "010|security.actor_type_enum": {
    direction: "FIX_PRISMA",
    authority:
      "A4: AUTOMATION_RULE and ANONYMOUS are the applied values, and wave 080's CHECK constraints (ck_ioza_command_requires_authorizable_method) plus governance.automation_rules.command_scope_authorized read AUTOMATION_RULE by name",
    actions: ["rename ActorType members in schema.target.prisma to AUTOMATION_RULE / ANONYMOUS"],
    covers: ["ENUM_VALUES"],
  },
  "010|security.security_event_status_enum": {
    direction: "FIX_PRISMA",
    authority:
      "A1 §security.security_events: 'Detectado→investigado→confirmado/descartado' with DEFAULT 'DETECTED' — descartado = DISCARDED",
    actions: ["rename SecurityEventStatus.DISMISSED to DISCARDED in schema.target.prisma"],
    covers: ["ENUM_VALUES"],
  },
  "010|governance.policy_publication_status_enum": {
    direction: "ESCALATE",
    decision: "D-09_GOVERNANCE_CATALOG_STATUS_VOCABULARY",
    authority: "A3 row 105 (2 values) + A1 §governance.policies (DEFAULT 'PUBLISHED') — the second label is not fixed",
    actions: ["leave both sides as they are until the decision is recorded"],
    covers: ["ENUM_VALUES"],
  },
  "010|governance.territorial_configuration_status_enum": {
    direction: "ESCALATE",
    decision: "D-09_GOVERNANCE_CATALOG_STATUS_VOCABULARY",
    authority: "A3 row 102 (2 values) + A1 §governance.territorial_configurations (DEFAULT 'ACTIVE')",
    actions: ["leave both sides as they are until the decision is recorded"],
    covers: ["ENUM_VALUES"],
  },

  // ---------------------------------------------------------------- wave 020
  "020|identity.devices": {
    direction: "FIX_DDL",
    authority: "A1 §identity.devices — is_trusted/created_at/deleted_at, FK person_id ON DELETE CASCADE",
    actions: [
      "add is_trusted boolean NOT NULL DEFAULT false, deleted_at timestamptz NULL",
      "rename registered_at to created_at (same meaning, same default)",
      "drop label (not in the ficha)",
      "FK person_id: RESTRICT -> CASCADE ('el dispositivo no tiene sentido sin su persona')",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "020|identity.emergency_contacts": {
    direction: "FIX_DDL",
    authority: "A1 §identity.emergency_contacts — endpoint jsonb NOT NULL, relationship, deleted_at, FK CASCADE",
    actions: [
      "rename contact_info to endpoint",
      "add relationship varchar(50) NULL, deleted_at timestamptz NULL",
      "FK person_id: RESTRICT -> CASCADE ('hija directa del agregado Person')",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "020|identity.liveness_checks": {
    direction: "FIX_DDL",
    authority: "A1 §identity.liveness_checks — method varchar(50) NOT NULL, completed_at",
    actions: ["rename performed_at to completed_at", "add method varchar(50) NOT NULL (table is CREATE_EMPTY)"],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB"],
  },
  "020|identity.people": {
    direction: "FIX_DDL",
    authority: "A1 §identity.people — date_of_birth, classification NOT NULL DEFAULT 'OPERATIONAL', deleted_at, display_alias NOT NULL",
    actions: [
      "add date_of_birth date NULL, classification security.information_classification_enum NOT NULL DEFAULT 'OPERATIONAL', deleted_at timestamptz NULL",
      "display_alias -> NOT NULL: legacy User.publicAlias is String (NOT NULL) in prisma/schema.prisma, so every migrated row already has one",
    ],
    covers: ["COLUMN_MISSING_IN_DB", "NULLABILITY"],
  },
  "020|identity.reputation_events": {
    direction: "FIX_DDL",
    authority: "A1 §identity.reputation_events — domain/created_at/evidence_id, reason NOT NULL, FK evidence_id SET NULL",
    actions: [
      "rename trust_domain to domain (the sync's only written value, GENERAL, is unchanged)",
      "add created_at timestamptz NOT NULL DEFAULT now(), evidence_id uuid NULL",
      "reason -> NOT NULL: the backfill always writes a reason string",
      "FK evidence_id -> evidence.evidence_records(id) ON DELETE SET NULL, declared in wave 030 (evidence schema does not exist yet in 020), same deferral pattern 010 already uses for identity.devices",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "NULLABILITY", "FK_MISSING_IN_DB"],
  },
  "020|identity.user_accounts": {
    direction: "FIX_DDL",
    authority:
      "A1 §identity.user_accounts — the ficha has NO email/google_sub/password_hash; contact data lives in identity.people.contact_info and credentials are out of this table by design",
    actions: [
      "drop email, google_sub, password_hash and the unique indexes over them",
      "add deleted_at timestamptz NULL",
      "fn_sync_users stops writing email — it is already written, unchanged, into identity.people.contact_info->>'email' by the same function, so no legacy datum is lost and one duplicate copy of PII disappears",
      "the dual-read spec for User drops email from its compared columns and keeps comparing contact_info",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB"],
  },
  "020|identity.verified_identities": {
    direction: "FIX_DDL",
    authority: "A1 §identity.verified_identities — document_type/country/identifier NOT NULL, expires_at",
    actions: [
      "add expires_at timestamptz NULL",
      "document_type/document_country/document_identifier -> NOT NULL: the backfill only inserts rows where governmentIdHash IS NOT NULL and already writes 'UNKNOWN'/'XX' placeholders, which the ficha's varchar(50)/varchar(2) accept",
    ],
    covers: ["COLUMN_MISSING_IN_DB", "NULLABILITY"],
  },
  "020|institution.institutional_credentials": {
    direction: "FIX_DDL",
    authority: "A1 §institution.institutional_credentials — credential_type varchar(100) NOT NULL, revoked_at, FK CASCADE",
    actions: [
      "rename credential_kind to credential_type",
      "add revoked_at timestamptz NULL",
      "FK institutional_membership_id: RESTRICT -> CASCADE",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "020|institution.institutional_memberships": {
    direction: "FIX_DDL",
    authority: "A1 §institution.institutional_memberships — role_title/role_scope/organizational_unit_id/revoked_at/created_at",
    actions: [
      "rename role_label to role_title",
      "add role_scope varchar(100) NULL, organizational_unit_id uuid NULL, revoked_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT now()",
      "add FK organizational_unit_id -> institution.organizational_units(id) ON DELETE SET NULL",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_MISSING_IN_DB"],
  },
  "020|institution.organizations": {
    direction: "FIX_DDL",
    authority: "A1 §institution.organizations — legal_name, has_formal_authority, updated_at, deleted_at",
    actions: [
      "rename name to legal_name",
      "add has_formal_authority boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz NULL",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB"],
  },
  "020|institution.organizational_units": {
    direction: "FIX_DDL",
    authority: "A1 §institution.organizational_units — parent_unit_id (self FK RESTRICT), created_at, FK organization_id CASCADE",
    actions: [
      "add parent_unit_id uuid NULL with a self FK ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now()",
      "FK organization_id: RESTRICT -> CASCADE",
    ],
    covers: ["COLUMN_MISSING_IN_DB", "FK_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "020|identity.user_account_status_enum": {
    direction: "FIX_DDL",
    authority: "A1 §identity.user_accounts Estado: ACTIVE/SUSPENDED/BLOCKED/PENDING/REVOKED/SOFT_DELETED, DEFAULT 'PENDING'",
    actions: [
      "replace the applied 6 labels with the ficha's 6 and set the default to PENDING",
      "the 020 backfill maps legacy ACTIVE -> ACTIVE and everything else -> SUSPENDED; both labels survive, so no mapping changes",
    ],
    covers: ["ENUM_VALUES"],
  },
  "020|identity.verified_identity_status_enum": {
    direction: "FIX_DDL",
    authority: "A1 §identity.verified_identities Estado: PENDING/VERIFIED/REJECTED/EXPIRED/SUSPENDED/REVOKED",
    actions: ["UNVERIFIED -> SUSPENDED; the backfill writes PENDING, which is unchanged"],
    covers: ["ENUM_VALUES"],
  },
  "020|identity.operational_session_status_enum": {
    direction: "FIX_DDL",
    authority: "A2 §OperationalSession Estado: ACTIVE/EXPIRED/ENDED_BY_USER/ENDED_BY_TIMEOUT (A1 agrees)",
    actions: ["replace IDLE/ENDED with ENDED_BY_USER/ENDED_BY_TIMEOUT; table is CREATE_EMPTY"],
    covers: ["ENUM_VALUES"],
  },
  "020|institution.institutional_membership_status_enum": {
    direction: "FIX_DDL",
    authority: "A1 §institution.institutional_memberships Estado: ACTIVE/REVOKED/EXPIRED",
    actions: ["replace SUSPENDED/ENDED with REVOKED/EXPIRED; table is CREATE_EMPTY"],
    covers: ["ENUM_VALUES"],
  },
  "020|identity.trust_domain_enum": {
    direction: "ESCALATE",
    decision: "D-10_TRUST_DOMAIN_VOCABULARY",
    authority: "A3 row 8 (8 values); the applied DDL flags its own labels as placeholders",
    actions: ["leave both sides; the sync writes only GENERAL, present in both sets"],
    covers: ["ENUM_VALUES"],
  },
  "020|identity.operational_session_end_reason_enum": {
    direction: "ESCALATE",
    decision: "D-11_SESSION_END_REASON_VOCABULARY",
    authority: "A3 row 7 (3 values); A2 fixes the status labels but not the reason labels",
    actions: ["leave both sides; table is CREATE_EMPTY"],
    covers: ["ENUM_VALUES"],
  },

  // ---------------------------------------------------------------- wave 030
  "030|evidence.evidence_records": {
    direction: "FIX_DDL",
    authority: "A1 §evidence.evidence_records — origin_type + the LocalOperationAlias block + consent/device/session FKs",
    actions: [
      "rename evidence_origin to origin_type (the value set PRIMARY|DERIVED is unchanged, and fn_sync_knowledge_evidence writes the same values under the new name)",
      "add local_alias varchar(100) NULL, device_id uuid NULL, operational_session_id uuid NULL, client_created_at timestamptz NULL, received_at timestamptz NULL, reconciliation_status varchar(50) NULL",
      "add FKs consent_id -> identity.consents ON DELETE SET NULL, device_id -> identity.devices ON DELETE SET NULL, operational_session_id -> identity.operational_sessions ON DELETE SET NULL (same shape observations already uses)",
      "the dual-read spec for KnowledgeEvidence compares origin_type instead of evidence_origin",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_MISSING_IN_DB"],
  },
  "030|evidence.confidence_level_enum": {
    direction: "ESCALATE",
    decision: "D-12_CONFIDENCE_LEVEL_TOP_LABEL",
    authority: "A1 §evidence.observations (5 values, DEFAULT 'UNKNOWN'); the top band's label is not fixed anywhere frozen",
    actions: ["leave both sides; no backfill writes the top band"],
    covers: ["ENUM_VALUES"],
  },

  // ---------------------------------------------------------------- wave 040
  "040|incident.sub_incidents": {
    direction: "FIX_DDL",
    authority: "A1 §incident.sub_incidents — area geography(Polygon,4326) NULL",
    actions: ["area -> NULL (a sub-incident may exist before its polygon is drawn); table is CREATE_EMPTY"],
    covers: ["NULLABILITY"],
  },

  // ---------------------------------------------------------------- wave 050
  "050|help.affected_people": {
    direction: "FIX_DDL",
    authority: "A1 §help.affected_people — affectation_status/classification/provisional_identity/merged_into_id, FK help_request_id CASCADE",
    actions: [
      "rename status to affectation_status (fn_sync_help_requests writes the same values under the new name)",
      "add classification security.information_classification_enum NOT NULL DEFAULT 'SENSITIVE', provisional_identity jsonb NULL, merged_into_id uuid NULL with a self FK ON DELETE SET NULL",
      "FK help_request_id: RESTRICT -> CASCADE ('hija directa, no N:M')",
      "the dual-read spec for HelpRequest compares affected_people.affectation_status",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "050|help.collaboration_invitations": {
    direction: "FIX_DDL",
    authority: "A1 §help.collaboration_invitations — capability/contextual_access/expires_at/distance + LocalOperationAlias block",
    actions: [
      "add capability_id uuid NULL (FK -> capability.capabilities ON DELETE SET NULL), contextual_access_id uuid NULL (FK -> security.contextual_accesses ON DELETE SET NULL)",
      "add expires_at timestamptz NOT NULL, approximate_distance_meters numeric(10,2) NULL and the six LocalOperationAlias columns",
      "table is CREATE_EMPTY, so NOT NULL needs no backfill",
    ],
    covers: ["COLUMN_MISSING_IN_DB", "FK_MISSING_IN_DB"],
  },
  "050|help.operational_needs": {
    direction: "FIX_DDL",
    authority: "A1 §help.operational_needs — incident_id NULL, help_request_id NULL, classification, both FKs SET NULL",
    actions: [
      "incident_id -> NULL (a need can be recorded before it is linked to an incident)",
      "add help_request_id uuid NULL (FK -> help.help_requests ON DELETE SET NULL), classification security.information_classification_enum NOT NULL",
      "FK incident_id: RESTRICT -> SET NULL",
    ],
    covers: ["COLUMN_MISSING_IN_DB", "NULLABILITY", "FK_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "050|help.rescue_assessments": {
    direction: "FIX_DDL",
    authority: "A1 §help.rescue_assessments — hazard_notes/mobility_notes/resources_needed/created_at, FK CASCADE",
    actions: [
      "replace assessed_at with created_at, drop assessed_by_actor_id and notes (none of the three is in the ficha; attribution lives in security.audit_logs)",
      "add hazard_notes text NULL, mobility_notes text NULL, resources_needed jsonb NULL",
      "FK help_request_id: RESTRICT -> CASCADE",
      "table is CREATE_EMPTY",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "050|help.situation_updates": {
    direction: "FIX_DDL",
    authority: "A1 §help.situation_updates — declared_by_actor_type/id NOT NULL + LocalOperationAlias block + device/session FKs",
    actions: [
      "add client_created_at/received_at/reconciliation_status; add FKs device_id -> identity.devices and operational_session_id -> identity.operational_sessions, both ON DELETE SET NULL",
      "declared_by_actor_type/declared_by_actor_id -> NOT NULL (an update always has a declarer); table is CREATE_EMPTY",
    ],
    covers: ["COLUMN_MISSING_IN_DB", "NULLABILITY", "FK_MISSING_IN_DB"],
  },
  "050|help.affectation_status_enum": {
    direction: "FIX_DDL",
    authority: "A1 §help.affected_people: AT_RISK|INJURED|TRAPPED|SAFE|DECEASED|UNKNOWN, DEFAULT 'UNKNOWN'",
    actions: ["MISSING -> TRAPPED; no migrated row uses MISSING (the 050 backfill writes UNKNOWN)"],
    covers: ["ENUM_VALUES"],
  },
  "050|help.operational_need_status_enum": {
    direction: "FIX_DDL",
    authority: "A1 §help.operational_needs: DEFAULT 'IDENTIFIED', 'Pendiente/convertida/resuelta'",
    actions: ["OPEN/FULFILLED/CANCELLED -> IDENTIFIED/CONVERTED/RESOLVED; table is CREATE_EMPTY"],
    covers: ["ENUM_VALUES"],
  },
  "050|help.resolution_claim_review_status_enum": {
    direction: "FIX_DDL",
    authority: "A1 §help.situation_updates: PENDING_OPERATOR_REVIEW|ACKNOWLEDGED_BY_OPERATOR",
    actions: ["REVIEWED -> ACKNOWLEDGED_BY_OPERATOR; table is CREATE_EMPTY"],
    covers: ["ENUM_VALUES"],
  },
  "050|help.situation_update_type_enum": {
    direction: "FIX_DDL",
    authority: "A1 §help.situation_updates: STATUS_CHANGE|RESOLUTION_CLAIM|OTHER",
    actions: ["NOTE -> OTHER; table is CREATE_EMPTY"],
    covers: ["ENUM_VALUES"],
  },
  // Reclassified while implementing: this one LOOKED mechanical and is not.
  // Adopting A2's twelve labels leaves legacy `assigned` and `cancelled` —
  // both in use by real rows on the realistic baseline — with no counterpart,
  // and the 050 backfill would have to invent one. That is a decision about
  // live data, so it is escalated instead of guessed.
  "050|help.help_request_status_enum": {
    direction: "ESCALATE",
    decision: "D-14_HELP_REQUEST_LIFECYCLE_ALIGNMENT",
    authority:
      "A2 §HelpRequest row 7 fixes the lifecycle (RECEIVED -> UNDER_ASSESSMENT -> VALIDATED -> LINKED_TO_INCIDENT -> CONVERTED_TO_MISSION -> IN_ATTENTION -> RESOLVED/TRANSFERRED/DUPLICATE/FALSE_ALARM/NO_CONTACT -> CLOSED); the applied set is a different 12-value machine and neither side matches A2",
    actions: [
      "leave both sides until the decision is recorded — the applied set is the one that can represent every legacy state today, so changing it unilaterally would be the riskier move",
      "when the decision lands: the enum, schema.target.prisma and the migration_meta.legacy_status_mapping rows for HelpRequest change together, and the 050 deferral reasons are re-checked against the new closed states",
    ],
    covers: ["ENUM_VALUES"],
  },

  // ---------------------------------------------------------------- wave 060
  "060|resource.aircraft_profiles": {
    direction: "FIX_DDL",
    authority: "A1 §resource.aircraft_profiles — vehicle_profile_id NOT NULL, crew_size, range_km, certification_expires_at, FK resource_id CASCADE",
    actions: [
      "drop aircraft_kind and created_at (not in the ficha)",
      "add vehicle_profile_id uuid NOT NULL with FK -> resource.vehicle_profiles ON DELETE RESTRICT, crew_size integer NULL, range_km numeric(10,2) NULL, certification_expires_at timestamptz NULL",
      "FK resource_id: RESTRICT -> CASCADE (UNIQUE 1:1 child)",
      "table is CREATE_EMPTY",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "060|resource.vehicle_profiles": {
    direction: "FIX_DDL",
    authority: "A1 §resource.vehicle_profiles — registration_number, fuel_or_energy_type, load_capacity, FK CASCADE",
    actions: [
      "drop vehicle_kind and created_at",
      "add registration_number varchar(50) NULL, fuel_or_energy_type varchar(50) NULL, load_capacity numeric(10,2) NULL",
      "FK resource_id: RESTRICT -> CASCADE",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "060|resource.operational_units": {
    direction: "FIX_DDL",
    authority: "A1 §resource.operational_units — member_count only, FK CASCADE",
    actions: ["drop created_at and name", "add member_count integer NULL", "FK resource_id: RESTRICT -> CASCADE"],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "FK_ON_DELETE"],
  },
  "060|resource.uncrewed_vehicle_profiles": {
    direction: "FIX_DDL",
    authority: "A1 §resource.uncrewed_vehicle_profiles — FK resource_id CASCADE",
    actions: ["FK resource_id: RESTRICT -> CASCADE"],
    covers: ["FK_ON_DELETE"],
  },
  "060|resource.resource_status_enum": {
    direction: "ESCALATE",
    decision: "D-13_RESOURCE_STATUS_AND_MOVEMENT_VOCABULARY",
    authority: "A1 §resource.resources points at 'Fase 11 (11 valores)', a section the frozen set does not carry",
    actions: ["leave both sides; wave 060 writes only AVAILABLE, present in both sets"],
    covers: ["ENUM_VALUES"],
  },
  "060|resource.inventory_movement_kind_enum": {
    direction: "ESCALATE",
    decision: "D-13_RESOURCE_STATUS_AND_MOVEMENT_VOCABULARY",
    authority: "A3 lists the enum and its count; no frozen document fixes IN/OUT vs RESTOCK/CONSUMPTION",
    actions: ["leave both sides; table is CREATE_EMPTY"],
    covers: ["ENUM_VALUES"],
  },

  // ---------------------------------------------------------------- wave 090
  "090|community.community_groups": {
    direction: "FIX_DDL",
    authority: "A1 §community.community_groups — name/status/created_at/deleted_at, and NO help_request_id",
    actions: [
      "drop help_request_id (a community group is not a child of a help request; the link, if it is ever needed, belongs in a join table)",
      "add deleted_at timestamptz NULL",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB"],
  },
  "090|community.dependents": {
    direction: "FIX_DDL",
    authority: "A1 §community.dependents — person_id NOT NULL, family_network_id NOT NULL, FK family_network CASCADE",
    actions: [
      "drop created_at (not in the ficha)",
      "add person_id uuid NOT NULL with FK -> identity.people ON DELETE RESTRICT",
      "family_network_id -> NOT NULL and its FK SET NULL -> CASCADE",
      "table is CREATE_EMPTY (wave 090 is blocked by D-08 for ice.*; community.* carries no migrated row)",
    ],
    covers: ["COLUMN_EXTRA_IN_DB", "COLUMN_MISSING_IN_DB", "NULLABILITY", "FK_ON_DELETE"],
  },
  "090|community.volunteers": {
    direction: "FIX_DDL",
    authority: "A1 §community.volunteers — community_group_id NULL with FK SET NULL",
    actions: ["add community_group_id uuid NULL with FK -> community.community_groups ON DELETE SET NULL"],
    covers: ["COLUMN_MISSING_IN_DB", "FK_MISSING_IN_DB"],
  },
};

/** `<wave>|<object>` for a classified drift entry, which is how PLAN is keyed. */
export function planKeyOf(entry) {
  if (entry.kind.startsWith("ENUM_")) return `${entry.wave}|${entry.object}`;
  return `${entry.wave}|${entry.object}`;
}

/**
 * Maps every REAL_DRIFT_TO_RECONCILE entry onto its plan entry.
 * Returns { covered, uncovered, byDirection, escalated }.
 */
export function applyPlan(classifiedRealDrift) {
  const covered = [];
  const uncovered = [];
  for (const entry of classifiedRealDrift) {
    // wave "???" is the comparer's marker for an object it could not attribute
    // to a wave; the resource_type_enum relocation covers the only such entry.
    const key = entry.wave === "???" ? "010|governance.resource_type_enum" : planKeyOf(entry);
    const plan = PLAN[key];
    if (!plan) {
      uncovered.push({ entry, key });
      continue;
    }
    covered.push({ entry, key, plan });
  }
  const byDirection = {};
  for (const direction of DIRECTIONS) {
    byDirection[direction] = covered.filter((c) => c.plan.direction === direction).length;
  }
  const escalated = [...new Set(covered.filter((c) => c.plan.direction === "ESCALATE").map((c) => c.plan.decision))];
  return { covered, uncovered, byDirection, escalated };
}
