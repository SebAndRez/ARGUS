import { describe, expect, it, vi } from "vitest";

/**
 * Deduplicacion/precedencia de reportes de refugios (spec ARGUS v1.0.3.4
 * §7/§15): autoridad de fuente > fecha de publicacion > fecha de
 * verificacion > fuentes concordantes > confianza. Solo se ejercitan las
 * funciones puras del modulo (`findExistingShelterPoi`, que si toca la
 * base de datos, no se usa aca); `@/lib/prisma` se mockea porque el modulo
 * importa transitivamente `criticalPoiPersistenceService.ts`, que lo
 * requiere a nivel de carga.
 */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { inferShelterEventType, shouldApplyShelterReport, buildShelterDedupKey } from "@/lib/criticalPoi/shelterStatusDeduplication";
import type { ShelterOperationalStatus, ShelterOperationalStatusReport } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

function baseStatus(overrides: Partial<ShelterOperationalStatus> = {}): ShelterOperationalStatus {
  return {
    id: "status-1",
    poiId: "poi-1",
    shelterStatus: "available",
    capacityStatus: "ok",
    sourceType: "municipality",
    sourceName: "Municipalidad de Ejemplo",
    confidence: 70,
    verificationStatus: "corroborated",
    lastUpdatedAt: "2026-07-15T10:00:00.000Z",
    isStale: false,
    publicationStatus: "active",
    createdAt: "2026-07-15T10:00:00.000Z",
    ...overrides,
  };
}

function baseReport(overrides: Partial<ShelterOperationalStatusReport> = {}): ShelterOperationalStatusReport {
  return {
    sourceType: "municipality",
    sourceName: "Municipalidad de Ejemplo",
    confidenceScore: 70,
    ...overrides,
  };
}

describe("buildShelterDedupKey", () => {
  it("normaliza nombre/comuna y redondea coordenadas", () => {
    const key = buildShelterDedupKey({ name: "Escuela Básica N°1", commune: "Ñuñoa", lat: -33.4569, lng: -70.5987 });
    expect(key).toBe("escuela b sica n 1:ñuñoa:-33.46:-70.6");
  });

  it("marca ausencia de coordenadas explícitamente, no como 0", () => {
    const key = buildShelterDedupKey({ name: "Refugio X" });
    expect(key).toContain("sin-lat");
    expect(key).toContain("sin-lng");
  });
});

describe("shouldApplyShelterReport", () => {
  it("siempre aplica cuando no existe estado previo (primer reporte)", () => {
    expect(shouldApplyShelterReport(null, baseReport())).toBe(true);
  });

  it("un reporte oficial (senapred) reemplaza uno de menor autoridad (municipality) sin importar fecha", () => {
    const existing = baseStatus({ sourceType: "municipality", sourcePublishedAt: "2026-07-16T00:00:00.000Z" });
    const incoming = baseReport({ sourceType: "senapred", sourcePublishedAt: "2026-07-14T00:00:00.000Z" });
    expect(shouldApplyShelterReport(existing, incoming)).toBe(true);
  });

  it("un reporte de menor autoridad NO reemplaza uno vigente de mayor autoridad", () => {
    const existing = baseStatus({ sourceType: "senapred", isStale: false });
    const incoming = baseReport({ sourceType: "osm" });
    expect(shouldApplyShelterReport(existing, incoming)).toBe(false);
  });

  it("un dato existente marcado isStale siempre pierde, incluso ante una fuente de menor autoridad", () => {
    const existing = baseStatus({ sourceType: "senapred", isStale: true });
    const incoming = baseReport({ sourceType: "osm" });
    expect(shouldApplyShelterReport(existing, incoming)).toBe(true);
  });

  it("misma autoridad: gana la publicacion mas reciente", () => {
    const existing = baseStatus({ sourceType: "media", sourcePublishedAt: "2026-07-10T00:00:00.000Z" });
    const older = baseReport({ sourceType: "media", sourcePublishedAt: "2026-07-05T00:00:00.000Z" });
    const newer = baseReport({ sourceType: "media", sourcePublishedAt: "2026-07-15T00:00:00.000Z" });
    expect(shouldApplyShelterReport(existing, older)).toBe(false);
    expect(shouldApplyShelterReport(existing, newer)).toBe(true);
  });

  it("misma autoridad y fecha: dos o mas fuentes concordantes hacen ganar al reporte entrante", () => {
    const existing = baseStatus({ sourceType: "media", sourcePublishedAt: undefined, confidence: 80, sourceName: "Medio A" });
    const incoming = baseReport({ sourceType: "media", sourcePublishedAt: undefined, confidenceScore: 50, sourceName: "Medio B" });
    expect(
      shouldApplyShelterReport(existing, incoming, { recentSourceNames: ["Medio A", "Medio C"] })
    ).toBe(true);
  });
});

describe("inferShelterEventType", () => {
  it("primer reporte -> created", () => {
    expect(inferShelterEventType(null, baseReport(), true)).toBe("created");
  });

  it("reporte no aplicado de autoridad comparable -> conflict_detected", () => {
    const existing = baseStatus({ sourceType: "senapred" });
    const incoming = baseReport({ sourceType: "senapred" });
    expect(inferShelterEventType(existing, incoming, false)).toBe("conflict_detected");
  });

  it("reporte no aplicado de menor autoridad -> source_updated (no es un conflicto real)", () => {
    const existing = baseStatus({ sourceType: "senapred" });
    const incoming = baseReport({ sourceType: "osm" });
    expect(inferShelterEventType(existing, incoming, false)).toBe("source_updated");
  });

  it("transicion a lleno -> full", () => {
    const existing = baseStatus({ shelterStatus: "available" });
    const incoming = baseReport({ shelterStatus: "full" });
    expect(inferShelterEventType(existing, incoming, true)).toBe("full");
  });

  it("ruta bloqueada -> route_blocked", () => {
    const existing = baseStatus({ routeStatus: "open" });
    const incoming = baseReport({ routeStatus: "blocked" });
    expect(inferShelterEventType(existing, incoming, true)).toBe("route_blocked");
  });

  it("solo cambia ocupacion -> occupancy_updated", () => {
    const existing = baseStatus();
    const incoming = baseReport({ occupancyCurrent: 40 });
    expect(inferShelterEventType(existing, incoming, true)).toBe("occupancy_updated");
  });
});
