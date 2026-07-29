/**
 * src/lib/database-target/dual-read/compare.ts
 *
 * Dual-read comparator for future parallel legacy/target reads (Executable
 * Migration Plan Fase 9). Not wired to any real read path yet — gated by
 * `targetDatabaseDualRead` (default `false`) wherever it is eventually
 * called. Compares identity, status, timestamps, jurisdiction, geometry,
 * classification, relations, and public redaction — the 8 axes Fase 9
 * names explicitly.
 *
 * Its result MUST NEVER be returned to an end user (Fase 9: "no devuelvas
 * diferencias target al usuario final") — callers may only log/metric it
 * (see `../observability/metrics.ts`), never surface it in an API response.
 */

export type DualReadFieldResult = "MATCH" | "EXPECTED_DIFFERENCE" | "MIGRATION_GAP" | "DATA_ERROR";

export type DualReadOverallResult = DualReadFieldResult | "TARGET_MISSING" | "LEGACY_MISSING";

export interface DualReadFieldComparison {
  field: string;
  result: DualReadFieldResult;
  detail?: string;
}

export interface DualReadComparisonReport {
  overall: DualReadOverallResult;
  /** Empty when overall is TARGET_MISSING/LEGACY_MISSING (no fields to compare). */
  fields: DualReadFieldComparison[];
}

export interface DualReadComparable {
  id: string;
  status?: string | null;
  timestamps?: Record<string, string | null>;
  jurisdictionId?: string | null;
  geometry?: { latitude: number; longitude: number } | null;
  classification?: string | null;
  /** Sorted, stable identifiers of related entities — order-independent by construction (callers must sort before passing in). */
  relations?: string[];
  /** The public-facing (already-redacted) projection each side would serve — compared structurally, never logged in full (see `logDualReadComparison`). */
  publicRedaction?: Record<string, unknown> | null;
}

export interface DualReadCompareOptions {
  /** Field names allowed to differ without being flagged as a gap (e.g. a known legacy/target vocabulary rename). */
  expectedDifferenceFields?: ReadonlySet<string>;
  /** Max degrees of lat/lng drift still considered MATCH (default ~1.1cm at the equator). */
  geometryToleranceDegrees?: number;
}

const DEFAULT_GEOMETRY_TOLERANCE_DEGREES = 0.0000001;

const SEVERITY_ORDER: Record<DualReadFieldResult, number> = {
  MATCH: 0,
  EXPECTED_DIFFERENCE: 1,
  MIGRATION_GAP: 2,
  DATA_ERROR: 3,
};

function worstOf(results: DualReadFieldResult[]): DualReadFieldResult {
  return results.reduce((worst, current) => (SEVERITY_ORDER[current] > SEVERITY_ORDER[worst] ? current : worst), "MATCH" as DualReadFieldResult);
}

function compareScalar(
  field: string,
  legacyValue: string | null | undefined,
  targetValue: string | null | undefined,
  options: DualReadCompareOptions,
  onMismatch: DualReadFieldResult
): DualReadFieldComparison {
  if ((legacyValue ?? null) === (targetValue ?? null)) {
    return { field, result: "MATCH" };
  }
  if (options.expectedDifferenceFields?.has(field)) {
    return { field, result: "EXPECTED_DIFFERENCE", detail: "known vocabulary difference" };
  }
  return { field, result: onMismatch, detail: `legacy=${JSON.stringify(legacyValue ?? null)} target=${JSON.stringify(targetValue ?? null)}` };
}

function compareTimestamps(
  legacy: Record<string, string | null> | undefined,
  target: Record<string, string | null> | undefined,
  options: DualReadCompareOptions
): DualReadFieldComparison[] {
  const keys = new Set([...Object.keys(legacy ?? {}), ...Object.keys(target ?? {})]);
  return [...keys].map((key) =>
    compareScalar(`timestamps.${key}`, legacy?.[key], target?.[key], options, "MIGRATION_GAP")
  );
}

function compareGeometry(
  legacy: DualReadComparable["geometry"],
  target: DualReadComparable["geometry"],
  options: DualReadCompareOptions
): DualReadFieldComparison {
  if (!legacy && !target) return { field: "geometry", result: "MATCH" };
  if (!legacy || !target) {
    return { field: "geometry", result: "DATA_ERROR", detail: "one side has geometry, the other does not" };
  }
  const tolerance = options.geometryToleranceDegrees ?? DEFAULT_GEOMETRY_TOLERANCE_DEGREES;
  const latDiff = Math.abs(legacy.latitude - target.latitude);
  const lngDiff = Math.abs(legacy.longitude - target.longitude);
  if (latDiff <= tolerance && lngDiff <= tolerance) {
    return { field: "geometry", result: "MATCH" };
  }
  return { field: "geometry", result: "DATA_ERROR", detail: `latDiff=${latDiff} lngDiff=${lngDiff}` };
}

function compareRelations(legacy: string[] | undefined, target: string[] | undefined): DualReadFieldComparison {
  const a = [...(legacy ?? [])].sort();
  const b = [...(target ?? [])].sort();
  if (a.length === b.length && a.every((v, i) => v === b[i])) {
    return { field: "relations", result: "MATCH" };
  }
  return { field: "relations", result: "MIGRATION_GAP", detail: `legacy=[${a.join(",")}] target=[${b.join(",")}]` };
}

function comparePublicRedaction(
  legacy: Record<string, unknown> | null | undefined,
  target: Record<string, unknown> | null | undefined
): DualReadFieldComparison {
  const a = legacy ?? null;
  const b = target ?? null;
  if (JSON.stringify(a) === JSON.stringify(b)) {
    return { field: "publicRedaction", result: "MATCH" };
  }
  return { field: "publicRedaction", result: "DATA_ERROR", detail: "public-facing redacted projection diverges" };
}

/**
 * Compares one legacy record against its target counterpart across the 8
 * axes Fase 9 names. Returns `TARGET_MISSING`/`LEGACY_MISSING` (no field
 * comparisons performed) when exactly one side is `null`.
 */
export function compareDualRead(
  legacy: DualReadComparable | null,
  target: DualReadComparable | null,
  options: DualReadCompareOptions = {}
): DualReadComparisonReport {
  if (!legacy && !target) {
    return {
      overall: "DATA_ERROR",
      fields: [{ field: "id", result: "DATA_ERROR", detail: "both legacy and target are null — nothing to compare" }],
    };
  }
  if (!target) return { overall: "TARGET_MISSING", fields: [] };
  if (!legacy) return { overall: "LEGACY_MISSING", fields: [] };

  const fields: DualReadFieldComparison[] = [
    compareScalar("id", legacy.id, target.id, options, "DATA_ERROR"),
    compareScalar("status", legacy.status, target.status, options, "MIGRATION_GAP"),
    ...compareTimestamps(legacy.timestamps, target.timestamps, options),
    compareScalar("jurisdictionId", legacy.jurisdictionId, target.jurisdictionId, options, "MIGRATION_GAP"),
    compareGeometry(legacy.geometry, target.geometry, options),
    compareScalar("classification", legacy.classification, target.classification, options, "DATA_ERROR"),
    compareRelations(legacy.relations, target.relations),
    comparePublicRedaction(legacy.publicRedaction, target.publicRedaction),
  ];

  return { overall: worstOf(fields.map((f) => f.result)), fields };
}
