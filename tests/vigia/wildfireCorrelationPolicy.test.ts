import { describe, expect, it } from "vitest";
import {
  evaluateWildfireCorrelation,
  WILDFIRE_CANDIDATE_THRESHOLD,
  WILDFIRE_MERGE_THRESHOLD,
  type WildfireCorrelationCandidate,
} from "@/lib/vigia/wildfireCorrelationPolicy";
import { correlateWildfireEvents } from "@/lib/vigia/wildfireCorrelationEngine";
import type { PromotedEvent } from "@/lib/vigia/globalAlertPromotionEngine";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

/**
 * ARGUS Prompt 15 — suite obligatoria de 20 casos para la correlación de
 * incendios (§26). Los primeros bloques ejercitan `evaluateWildfireCorrelation`
 * (par a par, pura y determinista); los últimos ejercitan
 * `correlateWildfireEvents` (agrupamiento completo de una corrida).
 */

const REF_TIME = "2026-07-14T12:00:00.000Z";

function hoursAfter(hours: number): string {
  return new Date(Date.parse(REF_TIME) + hours * 60 * 60 * 1000).toISOString();
}

const EFFIS_POLYGON = {
  type: "Polygon" as const,
  coordinates: [[[-70.62, -33.42], [-70.58, -33.42], [-70.58, -33.38], [-70.62, -33.38], [-70.62, -33.42]]],
};

function candidate(overrides: Partial<WildfireCorrelationCandidate> = {}): WildfireCorrelationCandidate {
  return {
    id: "candidate-1",
    sourceId: "nasa_firms",
    threat: "WILDFIRE",
    country: "CL",
    region: "Valparaíso",
    latitude: -33.4,
    longitude: -70.6,
    occurredAt: REF_TIME,
    detectedAt: REF_TIME,
    ...overrides,
  };
}

function firmsPoint(id: string, lat: number, lng: number, occurredAt = REF_TIME): WildfireCorrelationCandidate {
  return candidate({ id, sourceId: "nasa_firms", latitude: lat, longitude: lng, occurredAt, detectedAt: occurredAt });
}

function effisPerimeter(id = "effis-1", occurredAt = REF_TIME): WildfireCorrelationCandidate {
  return candidate({
    id,
    sourceId: "copernicus_effis",
    geometry: EFFIS_POLYGON,
    latitude: -33.4,
    longitude: -70.6,
    occurredAt,
    detectedAt: occurredAt,
  });
}

function emsActivation(id = "ems-1", lat = -33.405, lng = -70.605, occurredAt = REF_TIME): WildfireCorrelationCandidate {
  return candidate({ id, sourceId: "copernicus_ems", latitude: lat, longitude: lng, occurredAt, detectedAt: occurredAt });
}

describe("evaluateWildfireCorrelation — pares de fuentes", () => {
  it("Caso 1 — FIRMS repetido: dos observaciones sucesivas del mismo foco correlacionan (mismo cluster, pasadas distintas)", () => {
    const a = firmsPoint("firms-a", -33.400, -70.600, hoursAfter(0));
    const b = firmsPoint("firms-b", -33.401, -70.601, hoursAfter(6));
    const result = evaluateWildfireCorrelation(a, b);
    expect(result.decision).toBe("merge");
  });

  it("Caso 2 — FIRMS dentro del perímetro EFFIS: correlacionan, EFFIS es confirmación institucional", () => {
    const firms = firmsPoint("firms-in-effis", -33.400, -70.600);
    const effis = effisPerimeter();
    const result = evaluateWildfireCorrelation(firms, effis);
    expect(result.decision).toBe("merge");
    expect(result.contained).toBe(true);
    expect(result.pairLabel).toBe("FIRMS↔EFFIS");
  });

  it("Caso 3 — FIRMS y EMS en la misma zona y ventana: correlacionan sin duplicarse", () => {
    const firms = firmsPoint("firms-ems", -33.402, -70.602);
    const ems = emsActivation();
    const result = evaluateWildfireCorrelation(firms, ems);
    expect(result.decision).toBe("merge");
    expect(result.pairLabel).toBe("FIRMS↔EMS");
  });

  it("Caso 4 — EFFIS y EMS coincidentes: mismo incidente, activación asociada", () => {
    const effis = effisPerimeter();
    const ems = emsActivation();
    const result = evaluateWildfireCorrelation(effis, ems);
    expect(result.decision).toBe("merge");
    expect(result.pairLabel).toBe("EFFIS↔EMS");
  });

  it("Caso 5 — dos incendios cercanos, misma región/día, geometrías separadas: se mantienen separados", () => {
    const fireOne = firmsPoint("fire-one", -33.40, -70.60);
    // 0.5° ≈ 55km de separación en latitud: fuera del radio FIRMS↔FIRMS (25km) y sin polígono que los conecte.
    const fireTwo = firmsPoint("fire-two", -33.90, -70.60);
    const result = evaluateWildfireCorrelation(fireOne, fireTwo);
    expect(result.decision).toBe("separate");
    expect(result.reason).toBe("distance_exceeded");
  });

  it("Caso 6a — ~40km con continuidad geométrica (cadena de clusters FIRMS): correlacionable de extremo a extremo", () => {
    // Cadena de 3 clusters separados ~18km entre consecutivos (≤ 25km) que
    // cubren ~40km de punta a punta — unión por transitividad, no por la
    // distancia directa entre los extremos.
    const events: PromotedEvent[] = [
      buildPromotedEvent(firmsPoint("chain-a", -33.20, -70.60), "medium", 80),
      buildPromotedEvent(firmsPoint("chain-b", -33.36, -70.60), "medium", 80),
      buildPromotedEvent(firmsPoint("chain-c", -33.52, -70.60), "medium", 80),
    ];
    const merged = correlateWildfireEvents(events);
    expect(merged).toHaveLength(1);
    expect(merged[0].incident.sourceIds).toEqual(["nasa_firms"]);
    expect(merged[0].corroboratingSourceIds.length + 1).toBeLessThanOrEqual(3); // agrupados, no triplicados como incidentes separados
  });

  it("Caso 6b — ~40km sin continuidad (dos clusters aislados): se mantienen separados", () => {
    const a = firmsPoint("isolated-a", -33.20, -70.60);
    const b = firmsPoint("isolated-b", -33.56, -70.60); // ~40km directo, sin clusters intermedios
    const result = evaluateWildfireCorrelation(a, b);
    expect(result.decision).toBe("separate");
  });

  it("Caso 7 — hotspot fuera del polígono EFFIS más allá de la tolerancia: no se fusiona", () => {
    const firmsFar = firmsPoint("firms-far", -32.0, -70.6); // ~155km al norte del polígono
    const effis = effisPerimeter();
    const result = evaluateWildfireCorrelation(firmsFar, effis);
    expect(result.decision).toBe("separate");
    expect(result.reason).toBe("distance_exceeded");
  });

  it("Caso 8 — activación EMS territorial amplia no absorbe todos los incendios de la región", () => {
    const nearEms = firmsPoint("near-ems", -33.42, -70.62); // dentro de 30km
    const farFromEms = firmsPoint("far-ems", -34.5, -71.5); // fuera del radio operacional EMS
    const ems = emsActivation("ems-wide", -33.40, -70.60);
    expect(evaluateWildfireCorrelation(nearEms, ems).decision).toBe("merge");
    expect(evaluateWildfireCorrelation(farFromEms, ems).decision).toBe("separate");
  });

  it("Caso 11 — incidente resuelto: un hotspot nuevo ambiguo no se fusiona automáticamente", () => {
    const newHotspot = firmsPoint("new-hotspot", -33.401, -70.601);
    const resolvedIncident = candidate({
      id: "resolved-incident",
      sourceId: "copernicus_effis",
      geometry: EFFIS_POLYGON,
      lifecycle: "resolved",
    });
    const result = evaluateWildfireCorrelation(newHotspot, resolvedIncident);
    expect(result.decision).toBe("separate");
    expect(result.reason).toBe("terminal_lifecycle_requires_reopening");
  });

  it("Caso 14 — coordenadas inválidas: se aísla, no genera correlación falsa", () => {
    const invalid = candidate({ id: "invalid-coords", latitude: NaN, longitude: undefined as unknown as number });
    const valid = firmsPoint("valid", -33.4, -70.6);
    const result = evaluateWildfireCorrelation(invalid, valid);
    expect(result.decision).toBe("separate");
    expect(result.reason).toBe("invalid_coordinates");
  });

  it("Caso 15 — geometría inválida: manejo controlado, sin lanzar", () => {
    const broken = candidate({ id: "broken-geometry", geometry: { type: "Polygon", coordinates: null } as never });
    const valid = firmsPoint("valid-2", -33.4, -70.6);
    expect(() => evaluateWildfireCorrelation(broken, valid)).not.toThrow();
  });

  it("Caso 18 — determinismo: misma entrada produce siempre el mismo resultado", () => {
    const a = firmsPoint("det-a", -33.40, -70.60);
    const b = effisPerimeter("det-b");
    const first = evaluateWildfireCorrelation(a, b);
    const second = evaluateWildfireCorrelation(a, b);
    expect(second).toEqual(first);
  });

  it("no fusiona por coincidencia de país/categoría sin cercanía geográfica o temporal real", () => {
    const a = candidate({ id: "no-geo-a", country: "CL", region: "Valparaíso", latitude: -33.4, longitude: -70.6 });
    const b = candidate({ id: "no-geo-b", country: "CL", region: "Valparaíso", latitude: 10, longitude: -70.6 });
    expect(evaluateWildfireCorrelation(a, b).decision).toBe("separate");
  });

  it("país distinto conocido: nunca fusiona sin continuidad geométrica (bloqueo duro)", () => {
    const a = candidate({ id: "cl-side", country: "CL", latitude: -33.4, longitude: -70.6 });
    const b = candidate({ id: "ar-side", country: "AR", latitude: -33.4, longitude: -70.55 });
    const result = evaluateWildfireCorrelation(a, b);
    expect(result.decision).toBe("separate");
    expect(result.reason).toBe("country_mismatch");
  });

  it("solo se considera cuando ambos lados están clasificados WILDFIRE", () => {
    const wildfire = firmsPoint("wf", -33.4, -70.6);
    const notWildfire = candidate({ id: "flood", threat: "FLOOD", latitude: -33.4, longitude: -70.6 });
    const result = evaluateWildfireCorrelation(wildfire, notWildfire);
    expect(result.decision).toBe("separate");
    expect(result.reason).toBe("not_wildfire");
  });

  it("los umbrales están ordenados y son coherentes entre sí", () => {
    expect(WILDFIRE_MERGE_THRESHOLD).toBeGreaterThan(WILDFIRE_CANDIDATE_THRESHOLD);
    expect(WILDFIRE_CANDIDATE_THRESHOLD).toBeGreaterThan(0);
  });
});

/** Construye un `PromotedEvent` mínimo válido para `correlateWildfireEvents`. */
function buildPromotedEvent(
  source: WildfireCorrelationCandidate,
  severity: ArgusIncidentKnowledge["severity"] = "medium",
  sourceReliabilityScore = 80,
  overrides: Partial<ArgusIncidentKnowledge> = {}
): PromotedEvent {
  const incident: ArgusIncidentKnowledge = {
    id: source.id,
    title: `Incidente de incendio ${source.id}`,
    summary: "Fixture de prueba de correlación de incendios.",
    domain: "wildfire",
    subtype: "test_fixture",
    severity,
    confidenceScore: 70,
    actionabilityScore: 60,
    sourceReliabilityScore,
    evidenceCount: 1,
    sourceIds: [source.sourceId],
    sourceNames: [source.sourceId],
    occurredAt: source.occurredAt ?? undefined,
    detectedAt: source.detectedAt ?? undefined,
    country: source.country ?? undefined,
    region: source.region ?? undefined,
    latitude: source.latitude ?? undefined,
    longitude: source.longitude ?? undefined,
    geometry: source.geometry as Record<string, unknown> | undefined,
    technicalFactors: {} as ArgusIncidentKnowledge["technicalFactors"],
    causes: [],
    contributingFactors: [],
    responseActions: [],
    lessonsLearned: [],
    recommendedActions: [],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [],
    rawEvidenceRefs: [`ref-${source.id}`],
    createdAt: source.occurredAt ?? REF_TIME,
    updatedAt: source.occurredAt ?? REF_TIME,
    ...overrides,
  };
  return {
    incident,
    threat: "WILDFIRE",
    dedupKey: `wildfire:${source.id}`,
    outcome: "incident",
    reasons: ["fixture"],
    corroboratingSourceIds: [],
    generatesNotification: sourceReliabilityScore >= 90,
  };
}

describe("correlateWildfireEvents — agrupamiento de una corrida completa", () => {
  it("Caso 9/13 — FIRMS + EFFIS + EMS del mismo incendio producen un único incidente con las tres fuentes preservadas", () => {
    const events = [
      buildPromotedEvent(firmsPoint("group-firms", -33.401, -70.601), "medium", 80),
      buildPromotedEvent(effisPerimeter("group-effis"), "high", 90),
      buildPromotedEvent(emsActivation("group-ems"), "high", 91),
    ];
    const merged = correlateWildfireEvents(events);
    expect(merged).toHaveLength(1);
    expect(new Set(merged[0].incident.sourceIds)).toEqual(new Set(["nasa_firms", "copernicus_effis", "copernicus_ems"]));
    // La fuente institucional más confiable (EMS, 91) es la primaria — FIRMS no se pierde, queda como corroborante.
    expect(merged[0].corroboratingSourceIds).toContain("nasa_firms");
  });

  it("Caso 10 — crecimiento: nueva evidencia cercana y temporalmente compatible se incorpora sin crear un segundo grupo", () => {
    const base = buildPromotedEvent(effisPerimeter("growth-effis"), "high", 90);
    const growth = buildPromotedEvent(firmsPoint("growth-firms", -33.405, -70.605, hoursAfter(12)), "medium", 80);
    const merged = correlateWildfireEvents([base, growth]);
    expect(merged).toHaveLength(1);
    expect(merged[0].incident.sourceIds).toContain("copernicus_effis");
    expect(merged[0].incident.sourceIds).toContain("nasa_firms");
  });

  it("Caso 12 — FIRMS aislado de severidad alta no escala automáticamente a crítico al fusionarse con otro FIRMS", () => {
    const a = buildPromotedEvent(firmsPoint("high-a", -33.40, -70.60), "high", 80);
    const b = buildPromotedEvent(firmsPoint("high-b", -33.405, -70.605), "high", 80);
    const merged = correlateWildfireEvents([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].incident.severity).toBe("high");
    expect(merged[0].incident.severity).not.toBe("critical");
  });

  it("Caso 16 — idempotencia: el mismo conjunto de entrada produce siempre el mismo agrupamiento", () => {
    const events = [
      buildPromotedEvent(firmsPoint("idem-firms", -33.401, -70.601), "medium", 80),
      buildPromotedEvent(effisPerimeter("idem-effis"), "high", 90),
    ];
    const firstRun = correlateWildfireEvents(events);
    const secondRun = correlateWildfireEvents(events);
    expect(secondRun).toEqual(firstRun);
  });

  it("Caso 17 — el orden de llegada no cambia el resultado final (FIRMS→EFFIS vs EFFIS→FIRMS)", () => {
    const firms = buildPromotedEvent(firmsPoint("order-firms", -33.401, -70.601), "medium", 80);
    const effis = buildPromotedEvent(effisPerimeter("order-effis"), "high", 90);
    const firmsFirst = correlateWildfireEvents([firms, effis]);
    const effisFirst = correlateWildfireEvents([effis, firms]);
    expect(firmsFirst).toEqual(effisFirst);
  });

  it("Caso 19/20 — tres fuentes del mismo incendio colapsan en un único evento correlacionado (una sola notificación, un solo proyectado de mapa)", () => {
    const events = [
      buildPromotedEvent(firmsPoint("collapse-firms", -33.401, -70.601), "medium", 80),
      buildPromotedEvent(effisPerimeter("collapse-effis"), "high", 90),
      buildPromotedEvent(emsActivation("collapse-ems"), "high", 91),
    ];
    const merged = correlateWildfireEvents(events);
    expect(merged).toHaveLength(1);
    expect(merged[0].incident.sourceIds).toHaveLength(3);
  });

  it("dos incendios sin correlación producen dos grupos separados, no un colapso indebido", () => {
    const events = [
      buildPromotedEvent(firmsPoint("separate-a", -33.20, -70.60), "medium", 80),
      buildPromotedEvent(firmsPoint("separate-b", -33.90, -70.60), "medium", 80),
    ];
    const merged = correlateWildfireEvents(events);
    expect(merged).toHaveLength(2);
  });

  it("eventos con outcome drop nunca participan del agrupamiento", () => {
    const kept = buildPromotedEvent(firmsPoint("kept", -33.4, -70.6), "medium", 80);
    const dropped = { ...buildPromotedEvent(firmsPoint("dropped", -33.401, -70.601), "low", 80), outcome: "drop" as const };
    const merged = correlateWildfireEvents([kept, dropped]);
    expect(merged).toHaveLength(1);
    expect(merged[0].incident.id).toBe("kept");
  });
});
