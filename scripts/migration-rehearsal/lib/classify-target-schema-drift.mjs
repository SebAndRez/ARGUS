// scripts/migration-rehearsal/lib/classify-target-schema-drift.mjs
//
// Classifies every structural divergence between `prisma/schema.target.prisma`
// and the DDL the waves actually apply (the 508 issues compare-target-schema.mjs
// reports, of which 388 are structural) into the four buckets Paso 5 requires:
//
//   INTENTIONAL_SQL_ONLY     — the SQL has it on purpose and the model never will.
//   PRISMA_LIMITATION        — Prisma cannot express it, so the model cannot match.
//   REAL_DRIFT_TO_RECONCILE  — a mechanical disagreement someone must fix; no
//                              product decision is involved.
//   REQUIRES_HUMAN_DECISION  — which side is right depends on an open decision
//                              (D-06, D-08, T-09, the undesigned dispatch/alert
//                              domains, Ola 10 retirement...), so classifying it
//                              as benign would be inventing the decision.
//
// The classification is RULE-BASED and first-match-wins, so it is reproducible
// and reviewable: no entry is hand-labelled, and the rule that classified each
// entry is reported with it. Nothing here edits the schema or the DDL.
//
// It also answers the question Paso 5 actually needs answered: "does any real
// drift touch what the shadow-write or the dual-read reads or writes?" Those
// are the only divergences that make shadow-write/dual-read incorrect, and they
// are the only ones the mandate allows fixing right now. SHADOW_SURFACE below
// is the exact set of target tables the `migration_meta.fn_sync_*` functions
// write and `dual-read/legacyDualRead.ts` compares; a REAL_DRIFT entry on one
// of them is a blocking defect, not a backlog item.

/** Target tables the shadow-write writes and/or the dual-read compares, column by column where it matters. */
export const SHADOW_SURFACE = [
  "identity.people",
  "identity.user_accounts",
  "identity.verified_identities",
  "identity.consents",
  "identity.reputation_events",
  "security.audit_logs",
  "ingest.providers",
  "ingest.sources",
  "ingest.ingestion_runs",
  "ingest.source_records",
  "evidence.observations",
  "evidence.evidence_records",
  "incident.incidents",
  "incident.incident_candidates",
  "incident.incident_transitions",
  "help.help_requests",
  "help.affected_people",
  "resource.resources",
  "resource.facilities",
  "risk.risk_assessments",
  "risk.risk_assessment_revisions",
];

/**
 * Namespaces whose structural shape depends on an OPEN decision. The decision
 * is named so the report says what is waited on, never just "pending".
 */
const DECISION_BOUND = [
  { prefix: "ice.", decision: "D-08 medical/ICE data (nothing may be modeled or filled before it)" },
  { prefix: "media.", decision: "D-08 media/evidence handling" },
  { prefix: "alert.", decision: "Ola 7 alert/instruction domain is not designed yet (no legacy writer)" },
  { prefix: "comms.", decision: "Ola 7 communications domain is not designed yet (no legacy writer)" },
  { prefix: "mission.", decision: "dispatch/mission domain has no legacy writer and no approved design" },
  { prefix: "knowledge.", decision: "Ola 10 legacy retirement (knowledge.* is CREATE_EMPTY until then)" },
  { prefix: "proj.", decision: "Ola 10 projections" },
  { prefix: "geo.", decision: "D-07 official administrative boundaries + geocoder" },
  { prefix: "risk.", decision: "T-09 hazard catalog (Corrección #5)" },
  { prefix: "capability.", decision: "capability/availability model has no legacy source and no approved design" },
];

/** Tables whose CONTENT route is the D-06 decision; their columns cannot be judged until it lands. */
const D06_TABLES = ["resource.facilities", "resource.resources", "resource.inventories", "resource.supplies"];

/**
 * The columns the `migration_meta.fn_sync_*` functions actually write and the
 * dual-read actually compares, per table. This is what makes the difference
 * between "the model and the DDL disagree about a column nobody touches" and
 * "the shadow-write depends on a column the model says should not exist" — the
 * second kind WILL break the day the two are reconciled, so it has to be listed
 * by name and ratcheted, never left as an anonymous member of a 388-item pile.
 */
export const SYNCED_COLUMNS = {
  "identity.people": [
    "legal_name",
    "display_alias",
    "national_id_hash",
    "contact_info",
    "created_at",
    "updated_at",
  ],
  "identity.user_accounts": ["person_id", "status", "auth_provider", "last_login_at", "created_at", "updated_at"],
  "identity.verified_identities": ["person_id", "document_type", "document_country", "document_identifier", "status", "created_at"],
  "identity.consents": ["person_id", "purpose", "granted_at"],
  "identity.reputation_events": ["person_id", "domain", "delta", "reason", "occurred_at"],
  "security.audit_logs": [
    "actor_type",
    "actor_id",
    "action",
    "target_table",
    "target_id",
    "classification",
    "context",
    "result",
    "integrity_value",
    "integrity_key_id",
    "occurred_at",
  ],
  "ingest.providers": ["name", "organization_id", "status"],
  "ingest.sources": ["provider_id", "endpoint_signature", "name", "status", "created_at"],
  "ingest.ingestion_runs": ["source_id", "idempotency_key", "origin_kind", "status", "started_at", "completed_at"],
  "ingest.source_records": [
    "ingestion_run_id",
    "source_id",
    "origin_kind",
    "external_id",
    "provenance",
    "raw_content",
    "content_hash",
    "received_at",
  ],
  "evidence.observations": [
    "origin_type",
    "author_type",
    "author_person_id",
    "source_record_id",
    "claim_text",
    "provenance",
    "occurred_at",
    "reported_at",
    "created_at",
  ],
  "evidence.evidence_records": ["origin_type", "classification", "chain_of_custody", "created_at"],
  "incident.incidents": [
    "incident_type_id",
    "verification_status",
    "operational_status",
    "title",
    "description",
    "created_at",
  ],
  "incident.incident_candidates": ["status", "correlation_key", "classification", "created_at"],
  "incident.incident_transitions": [
    "incident_id",
    "dimension",
    "previous_value",
    "new_value",
    "decided_by_actor_type",
    "decided_by_actor_id",
    "occurred_at",
  ],
  "help.help_requests": ["requester_person_id", "status", "classification", "created_at"],
  "help.affected_people": ["help_request_id", "person_id", "affectation_status", "created_at"],
  "resource.resources": ["resource_type", "status", "created_at"],
  "resource.facilities": ["resource_id", "capacity_total", "occupancy_current"],
  "risk.risk_assessments": ["hazard_type_id", "classification", "status", "created_at"],
  "risk.risk_assessment_revisions": ["risk_assessment_id", "revision_number", "content_snapshot", "created_at"],
};

/** The column an issue's detail is about, or null when the issue is not column-scoped. */
export function columnOf(detail) {
  const text = String(detail ?? "").trim();
  if (text === "") return null;
  const fk = text.match(/^\(([a-z0-9_]+)\)/i);
  if (fk) return fk[1];
  const token = text.match(/^([a-z0-9_]+)/i);
  return token ? token[1] : null;
}

export const DRIFT_CLASSES = [
  "INTENTIONAL_SQL_ONLY",
  "PRISMA_LIMITATION",
  "REAL_DRIFT_TO_RECONCILE",
  "REQUIRES_HUMAN_DECISION",
];

/**
 * @param {string} issue - "<wave>|<KIND>|<object>|<detail>"
 * @returns {{wave: string, kind: string, object: string, detail: string, class: string, rule: string, rationale: string, onShadowSurface: boolean}}
 */
export function classifyDriftIssue(issue) {
  const [wave = "", kind = "", object = "", detail = ""] = String(issue).split("|");
  const onShadowSurface = SHADOW_SURFACE.includes(object);
  const column = columnOf(detail);
  // Does the shadow-write/dual-read depend on the exact column this issue is
  // about? If so, reconciling the model and the DDL will touch the sync path.
  const affectsSyncedColumn = Boolean(column) && (SYNCED_COLUMNS[object] ?? []).includes(column);

  const decide = (cls, rule, rationale) => ({
    wave,
    kind,
    object,
    detail,
    class: cls,
    rule,
    rationale,
    onShadowSurface,
    column,
    affectsSyncedColumn,
  });

  // 1. The D-02 provenance mixin: legacy_source/legacy_record_id/legacy_status/
  //    migration_confidence/migration_review_status. Migration bookkeeping that
  //    the steady-state model deliberately does not carry — the columns are
  //    dropped with the migration program, not with a model change.
  if (kind === "D02_MIXIN_ONLY_IN_SQL") {
    return decide(
      "INTENTIONAL_SQL_ONLY",
      "d02-mixin",
      "D-02 legacy-provenance mixin: exists only while the migration does, never in schema.target.prisma"
    );
  }

  // 2. Views. Prisma 4.16 has no stable view support, so a view can never
  //    appear in the model; every one of these is a MIGRATION_REVIEW_QUEUE view
  //    or a projection created by SQL on purpose.
  if (kind === "VIEW_NOT_MODELED") {
    return decide(
      "PRISMA_LIMITATION",
      "view-not-modelable",
      "Prisma cannot model a view; these are the migration review-queue/projection views the SQL owns"
    );
  }

  // 3. Anything inside a namespace whose shape is waiting on a decision. Judging
  //    these as benign would BE the decision.
  const bound = DECISION_BOUND.find((entry) => object.startsWith(entry.prefix));
  if (bound) {
    return decide("REQUIRES_HUMAN_DECISION", "decision-bound-namespace", bound.decision);
  }
  if (D06_TABLES.includes(object)) {
    return decide("REQUIRES_HUMAN_DECISION", "d06-route", "D-06 CriticalPoi route classification decides what these tables must hold");
  }

  // 4. Everything left is a mechanical disagreement: a column, enum value,
  //    nullability, type or FK that one side has and the other does not, in a
  //    namespace with no open decision. Someone must make the two agree; no
  //    product call is involved.
  return decide(
    "REAL_DRIFT_TO_RECONCILE",
    "mechanical-mismatch",
    `${kind} in ${object} with no open decision attached — the model and the DDL must be made to agree`
  );
}

/**
 * @param {string[]} issues
 */
export function classifyAll(issues) {
  const classified = issues.map(classifyDriftIssue);
  const counts = Object.fromEntries(DRIFT_CLASSES.map((cls) => [cls, 0]));
  const byWave = {};
  for (const entry of classified) {
    counts[entry.class] += 1;
    byWave[entry.wave] = byWave[entry.wave] ?? Object.fromEntries(DRIFT_CLASSES.map((cls) => [cls, 0]));
    byWave[entry.wave][entry.class] += 1;
  }
  const onShadowSurface = classified.filter((entry) => entry.class === "REAL_DRIFT_TO_RECONCILE" && entry.onShadowSurface);
  // The ratchet set: real drift about a column the shadow-write writes or the
  // dual-read compares. Every entry here is a pre-cutover reconciliation item
  // that will change the sync path, so a NEW one must never appear unnoticed.
  const shadowDependent = classified.filter(
    (entry) => entry.class === "REAL_DRIFT_TO_RECONCILE" && entry.affectsSyncedColumn
  );
  return { classified, counts, byWave, onShadowSurface, shadowDependent };
}
