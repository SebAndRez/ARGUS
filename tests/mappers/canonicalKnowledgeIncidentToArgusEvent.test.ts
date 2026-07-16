import { describe, expect, it, vi } from "vitest";

/**
 * Regression suite for the Prompt 9 fix: `KnowledgeIncident → ArgusEvent`
 * must be a single canonical projection, not two independently-diverging
 * mapper implementations. See
 * docs/architecture/ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md.
 *
 * `@/lib/prisma` is mocked purely to keep this a hermetic unit-test process:
 * `canonicalKnowledgeIncidentToArgusEvent` never calls it, but it is
 * transitively imported (via `@/lib/vigia/sourceRegistry`, for the pure
 * `getVigiaSource` lookup) in the same module graph as `getVigiaSourceHealth`,
 * which does. Real `DATABASE_URL` is intentionally never available in this
 * suite (see tests/setup.ts) — without this mock, importing the module graph
 * would try to construct a real `PrismaClient` and fail.
 */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  canonicalKnowledgeIncidentToArgusEvent,
  mapCanonicalLifecycleToArgusStatus,
  type CanonicalKnowledgeIncidentInput,
} from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import { vigiaIncidentToArgusEvent } from "@/lib/vigia/vigiaIncidentToArgusEvent";
import { knowledgeIncidentToArgusEvent } from "@/lib/knowledge-intake/map/knowledgeIncidentToArgusEvent";

function buildIncident(overrides: Partial<CanonicalKnowledgeIncidentInput> = {}): CanonicalKnowledgeIncidentInput {
  return {
    id: "inc-1",
    externalId: "usgs-abc123",
    sourceId: "usgs_earthquake",
    sourceName: "USGS Earthquake Hazards",
    domain: "earthquake",
    subtype: null,
    title: "M6.1 earthquake near Valparaiso",
    summary: "A magnitude 6.1 earthquake occurred offshore.",
    severity: "high",
    confidenceScore: 82,
    country: "CL",
    region: "Valparaiso",
    locality: null,
    latitude: -33.05,
    longitude: -71.62,
    geometryJson: null,
    technicalFactorsJson: { lifecycle: "active" },
    impactJson: null,
    casualtiesJson: null,
    recommendedActionsJson: null,
    rawEvidenceRefsJson: ["https://earthquake.usgs.gov/x"],
    tagsJson: [],
    occurredAt: new Date("2026-07-14T10:00:00.000Z"),
    detectedAt: new Date("2026-07-14T10:02:00.000Z"),
    createdAt: new Date("2026-07-14T10:02:30.000Z"),
    updatedAt: new Date("2026-07-14T10:05:00.000Z"),
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

function asLegacyInput(incident: CanonicalKnowledgeIncidentInput) {
  // The legacy wrapper signatures expect the full generated Prisma row type;
  // `CanonicalKnowledgeIncidentInput` is a structural subset by design
  // (Prompt 9 §6), so tests bridge the gap with an explicit unknown-cast
  // rather than widening the fixture with unused Prisma-only fields.
  return incident as unknown as Parameters<typeof vigiaIncidentToArgusEvent>[0];
}

describe("Caso 1 — igualdad entre rutas (los wrappers legacy delegan al canónico)", () => {
  it("vigiaIncidentToArgusEvent produce exactamente el mismo resultado que el canónico con idPrefix vigia", () => {
    const incident = buildIncident();
    expect(vigiaIncidentToArgusEvent(asLegacyInput(incident))).toEqual(
      canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "vigia" })
    );
  });

  it("knowledgeIncidentToArgusEvent produce exactamente el mismo resultado que el canónico con idPrefix chile-alert", () => {
    const incident = buildIncident({
      sourceId: "senapred_eventos",
      sourceName: "SENAPRED Chile (alertas oficiales)",
      technicalFactorsJson: { region: "Valparaíso", lifecycle: "active" },
      tagsJson: ["senapred", "severe_weather", "lifecycle:active"],
    });
    expect(knowledgeIncidentToArgusEvent(asLegacyInput(incident))).toEqual(
      canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "chile-alert" })
    );
  });
});

describe("Caso 2 — severidad GDACS verde", () => {
  it("nunca escala a alta/crítica sin impacto real (0 deaths no cuenta)", () => {
    const incident = buildIncident({
      sourceId: "gdacs",
      sourceName: "GDACS",
      severity: "critical", // valor previamente persistido, stale
      technicalFactorsJson: { gdacsAlertLevel: "green" },
      summary: "The flood caused 0 deaths and 1200 displaced.",
      tagsJson: ["gdacs"],
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.severity).not.toBe("critical");
    expect(event?.severity).not.toBe("high");
    expect(event?.severity).toBe("medium");
  });
});

describe("Caso 3 — severidad GDACS roja", () => {
  it("se normaliza a crítica según la regla aprobada", () => {
    const incident = buildIncident({
      sourceId: "gdacs",
      sourceName: "GDACS",
      severity: "low",
      technicalFactorsJson: { gdacsAlertLevel: "red" },
      tagsJson: ["gdacs"],
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.severity).toBe("critical");
  });
});

describe("Caso 4 — severidad desconocida", () => {
  it("cae a un fallback seguro, nunca crítico automáticamente", () => {
    const incident = buildIncident({ severity: "totally-unrecognized-value" });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.severity).toBe("medium");
    expect(event?.severity).not.toBe("critical");
  });
});

describe("Caso 5 — lifecycle activo", () => {
  it("produce un estado activo coherente", () => {
    const incident = buildIncident({ technicalFactorsJson: { lifecycle: "active" }, severity: "high" });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.status).toBe("active");
  });
});

describe("Caso 6 — lifecycle resuelto", () => {
  it("nunca se proyecta como activo", () => {
    const incident = buildIncident({ technicalFactorsJson: { lifecycle: "resolved" }, severity: "critical" });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.status).toBe("resolved");
    expect(event?.status).not.toBe("active");
  });

  it("una cancelación explícita por tag siempre gana, incluso si el campo no se actualizó", () => {
    const incident = buildIncident({
      technicalFactorsJson: { lifecycle: "active" },
      tagsJson: ["lifecycle:cancelled"],
      severity: "critical",
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.status).toBe("resolved");
  });
});

describe("Caso 7 — lifecycle desconocido", () => {
  it("cae al fallback documentado por severidad (mapCanonicalLifecycleToArgusStatus)", () => {
    const status = mapCanonicalLifecycleToArgusStatus({
      tags: [],
      lifecycleField: "not-a-real-state",
      severity: "high",
    });
    expect(status).toBe("risk");
  });

  it("se refleja igual a través de la proyección completa", () => {
    const incident = buildIncident({ technicalFactorsJson: { lifecycle: "not-a-real-state" }, severity: "high" });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.status).toBe("risk");
  });
});

describe("Caso 8 — geometría válida se preserva correctamente", () => {
  it("Point vía lat/lng cuando no hay geometryJson", () => {
    const incident = buildIncident({ geometryJson: null, latitude: -33.4, longitude: -70.6 });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.geometry).toEqual({ type: "point", coordinates: [-33.4, -70.6] });
  });

  it("Polygon administrativo se preserva sin fabricar un fallback", () => {
    const incident = buildIncident({
      geometryJson: {
        type: "administrative_area",
        geojson: {
          type: "Polygon",
          coordinates: [[[-71, -33], [-70, -33], [-70, -32], [-71, -33]]],
        },
        regionNames: ["Valparaíso"],
        anchor: [-33, -71],
        precisionLevel: "region",
      },
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.geometry.type).toBe("administrative_area");
    if (event && event.geometry.type === "administrative_area") {
      expect(event.geometry.geojson.type).toBe("Polygon");
      expect(event.geometry.regionNames).toEqual(["Valparaíso"]);
    }
  });

  it("MultiPolygon administrativo se preserva sin fabricar un fallback", () => {
    const incident = buildIncident({
      geometryJson: {
        type: "administrative_area",
        geojson: {
          type: "MultiPolygon",
          coordinates: [[[[-71, -33], [-70, -33], [-70, -32], [-71, -33]]]],
        },
        regionNames: ["Valparaíso", "Metropolitana"],
        anchor: [-33, -71],
        precisionLevel: "commune",
      },
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.geometry.type).toBe("administrative_area");
    if (event && event.geometry.type === "administrative_area") {
      expect(event.geometry.geojson.type).toBe("MultiPolygon");
    }
    expect(event?.geometryPrecision).toBe("administrative_commune");
  });
});

describe("Caso 9 — bbox nunca se convierte en polígono visible", () => {
  it("una forma bbox mal etiquetada cae al fallback de punto", () => {
    const incident = buildIncident({
      geometryJson: { type: "bbox", south: -34, west: -72, north: -33, east: -71 },
      latitude: -33.5,
      longitude: -71.5,
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.geometry).toEqual({ type: "point", coordinates: [-33.5, -71.5] });
  });
});

describe("Caso 10 — coordenadas faltantes", () => {
  it("sin geometría ni coordenadas: resultado controlado (null), nunca un evento engañoso", () => {
    const incident = buildIncident({ geometryJson: null, latitude: null, longitude: null });
    expect(canonicalKnowledgeIncidentToArgusEvent(incident)).toBeNull();
  });

  it("coordenadas no finitas (NaN) se descartan de forma segura, sin serializar NaN", () => {
    const incident = buildIncident({ geometryJson: null, latitude: Number.NaN, longitude: -71 });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event).toBeNull();
  });
});

describe("Caso 11 — datos demo", () => {
  it("preserva isDemo y nunca se presenta como fuente oficial", () => {
    const incident = buildIncident({
      sourceId: "senapred_eventos",
      sourceName: "SENAPRED Chile (alertas oficiales)",
      tagsJson: ["seed"],
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.isDemo).toBe(true);
    expect(event?.sourceType).not.toBe("official");
  });

  it("no infiere isDemo únicamente por una palabra débil en texto libre ajena a un caso real", () => {
    const incident = buildIncident({
      summary: "Se recolectó una muestra de agua (water sample) cerca del epicentro.",
      tagsJson: [],
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.isDemo).toBe(false);
  });
});

describe("Caso 12 — fuente oficial", () => {
  it("sourceType official solo cuando la fuente lo respalda y no es demo", () => {
    const incident = buildIncident({ sourceId: "usgs_earthquake", tagsJson: [] });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.sourceType).toBe("official");
  });

  it("una fuente no oficial nunca se marca como official", () => {
    const incident = buildIncident({ sourceId: "open-meteo", tagsJson: [] });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.sourceType).not.toBe("official");
  });
});

describe("Caso 13 — fechas", () => {
  it("se serializan de forma consistente en UTC, sin depender de la zona horaria local", () => {
    const incident = buildIncident({
      occurredAt: new Date("2026-07-14T10:00:00.000Z"),
      detectedAt: new Date("2026-07-14T10:02:00.000Z"),
      updatedAt: new Date("2026-07-14T10:05:00.000Z"),
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.validFrom).toBe("2026-07-14T10:00:00.000Z");
    expect(event?.detectedAt).toBe("2026-07-14T10:02:00.000Z");
    expect(event?.lastUpdated).toBe("2026-07-14T10:05:00.000Z");
  });

  it("acepta fechas como string ISO igual que objetos Date", () => {
    const incident = buildIncident({
      occurredAt: "2026-07-14T10:00:00.000Z",
      detectedAt: "2026-07-14T10:02:00.000Z",
      updatedAt: "2026-07-14T10:05:00.000Z",
      createdAt: "2026-07-14T09:59:00.000Z",
    });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.lastUpdated).toBe("2026-07-14T10:05:00.000Z");
  });

  it("una fecha inválida no rompe la serialización, cae a un fallback controlado", () => {
    const incident = buildIncident({ detectedAt: "not-a-real-date", occurredAt: null });
    const event = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(event?.detectedAt).toBe(new Date(incident.createdAt as Date).toISOString());
  });
});

describe("Caso 14 — inmutabilidad", () => {
  it("el input no se modifica", () => {
    const incident = deepFreeze(buildIncident());
    expect(() => canonicalKnowledgeIncidentToArgusEvent(incident)).not.toThrow();
  });
});

describe("Caso 15 — determinismo", () => {
  it("dos ejecuciones con el mismo input producen el mismo resultado", () => {
    const incident = buildIncident();
    const first = canonicalKnowledgeIncidentToArgusEvent(incident);
    const second = canonicalKnowledgeIncidentToArgusEvent(incident);
    expect(first).toEqual(second);
  });
});
