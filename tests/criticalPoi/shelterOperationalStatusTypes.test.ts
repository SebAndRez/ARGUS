import { describe, expect, it } from "vitest";
import {
  toPublicShelterOperationalStatus,
  toPublicShelterStatusEvidence,
} from "@/lib/criticalPoi/shelterOperationalStatusTypes";
import type { ShelterOperationalStatus, ShelterStatusEvidence } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Prueba unitaria y exhaustiva de la redaccion publica (Fase 2B/2B.2):
 * verifica CADA clave del allowlist de `evidence.payload` individualmente
 * (no solo un par de ejemplos), ademas de las funciones de mapeo en si.
 */

const FULL_STATUS: ShelterOperationalStatus = {
  id: "status-1",
  poiId: "poi-1",
  shelterStatus: "available",
  capacityStatus: "ok",
  capacityTotal: 200,
  occupancyCurrent: 50,
  capacityDeclared: 180,
  capacityAvailable: 150,
  occupancyPercentage: 0.25,
  hasWater: true,
  hasElectricity: true,
  hasFood: false,
  hasMedical: false,
  hasHeating: true,
  hasBathrooms: true,
  hasShowers: false,
  isAccessible: true,
  allowsPets: false,
  hasConnectivity: true,
  operatorName: "Juan Perez",
  contactPhone: "+56 9 1234 5678",
  contactNotes: "Llamar solo despues de las 8am",
  operatingHours: "24 Horas",
  routeStatus: "open",
  sourceType: "manual_operator",
  sourceName: "Operador ARGUS",
  sourceUrl: "https://example.org/fuente",
  sourcePublishedAt: "2026-07-17T00:00:00.000Z",
  confidence: 70,
  verificationStatus: "unverified",
  lastUpdatedAt: "2026-07-18T00:00:00.000Z",
  lastVerifiedAt: "2026-07-17T12:00:00.000Z",
  isStale: false,
  linkedIncidentId: "incident-1",
  publicationStatus: "active",
  createdAt: "2026-07-16T00:00:00.000Z",
};

const SENSITIVE_STATUS_FIELDS = ["operatorName", "contactPhone", "contactNotes"] as const;

describe("toPublicShelterOperationalStatus", () => {
  it("conserva todos los campos no sensibles con su valor exacto", () => {
    const result = toPublicShelterOperationalStatus(FULL_STATUS) as Record<string, unknown>;
    for (const [key, value] of Object.entries(FULL_STATUS)) {
      if ((SENSITIVE_STATUS_FIELDS as readonly string[]).includes(key)) continue;
      expect(result[key]).toBe(value);
    }
  });

  it("excluye operatorName/contactPhone/contactNotes sin importar el valor", () => {
    const result = toPublicShelterOperationalStatus(FULL_STATUS) as Record<string, unknown>;
    expect(result.operatorName).toBeUndefined();
    expect(result.contactPhone).toBeUndefined();
    expect(result.contactNotes).toBeUndefined();
    expect(Object.keys(result)).not.toContain("operatorName");
    expect(Object.keys(result)).not.toContain("contactPhone");
    expect(Object.keys(result)).not.toContain("contactNotes");
  });
});

describe("toPublicShelterStatusEvidence — allowlist exhaustiva de payload", () => {
  const PUBLIC_PAYLOAD_KEYS = [
    "shelterStatus",
    "capacityTotal",
    "occupancyCurrent",
    "capacityDeclared",
    "hasWater",
    "hasElectricity",
    "hasFood",
    "hasMedical",
    "hasHeating",
    "hasBathrooms",
    "hasShowers",
    "isAccessible",
    "allowsPets",
    "hasConnectivity",
    "operatingHours",
    "routeStatus",
    "verificationStatus",
    "lastVerifiedAt",
    "linkedIncidentId",
    "sourceType",
    "sourceName",
    "sourceUrl",
    "sourcePublishedAt",
    "confidenceScore",
  ] as const;

  function buildEvidence(payload: Record<string, unknown>): ShelterStatusEvidence {
    return {
      id: "evidence-1",
      poiId: "poi-1",
      eventType: "capacity_updated",
      sourceType: "manual_operator",
      sourceName: "Operador ARGUS",
      confidenceScore: 70,
      payload,
      createdAt: "2026-07-18T00:00:00.000Z",
    };
  }

  it.each(PUBLIC_PAYLOAD_KEYS)("preserva la clave permitida '%s' con su valor exacto cuando esta presente", (key) => {
    const sentinelValue = `sentinel-value-for-${key}`;
    const evidence = buildEvidence({ [key]: sentinelValue });
    const result = toPublicShelterStatusEvidence(evidence);
    expect(result.payload?.[key]).toBe(sentinelValue);
  });

  it("las 3 claves sensibles nunca sobreviven, incluso siendo las UNICAS presentes en el payload", () => {
    const evidence = buildEvidence({
      operatorName: "Juan Perez",
      contactPhone: "+56 9 1234 5678",
      contactNotes: "Nota interna",
    });
    const result = toPublicShelterStatusEvidence(evidence);
    expect(result.payload).toEqual({});
  });

  it("una clave completamente desconocida (no listada ni como sensible ni como permitida) tambien se descarta", () => {
    const evidence = buildEvidence({
      capacityTotal: 100,
      someFutureFieldNoOneAddedToTheAllowlistYet: "deberia desaparecer",
    });
    const result = toPublicShelterStatusEvidence(evidence);
    expect(result.payload).toEqual({ capacityTotal: 100 });
  });

  it("payload con TODAS las claves permitidas + las 3 sensibles + 1 desconocida -> solo sobreviven exactamente las permitidas presentes", () => {
    const fullPayload: Record<string, unknown> = {};
    for (const key of PUBLIC_PAYLOAD_KEYS) fullPayload[key] = `value-${key}`;
    fullPayload.operatorName = "Juan Perez";
    fullPayload.contactPhone = "+56 9 1234 5678";
    fullPayload.contactNotes = "Nota interna";
    fullPayload.unknownFutureField = "no deberia estar";

    const evidence = buildEvidence(fullPayload);
    const result = toPublicShelterStatusEvidence(evidence);

    expect(Object.keys(result.payload ?? {}).sort()).toEqual([...PUBLIC_PAYLOAD_KEYS].sort());
    for (const key of PUBLIC_PAYLOAD_KEYS) {
      expect(result.payload?.[key]).toBe(`value-${key}`);
    }
  });

  it("payload ausente -> se conserva como undefined, no como objeto vacio artificial", () => {
    const evidence = buildEvidence({});
    evidence.payload = undefined;
    const result = toPublicShelterStatusEvidence(evidence);
    expect(result.payload).toBeUndefined();
  });
});
