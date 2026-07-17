import { describe, expect, it } from "vitest";
import {
  toOperatorHelpRequest,
  toOperatorReport,
  toPublicHelpRequest,
  toPublicReport,
} from "@/lib/security/incidentDto";

/**
 * PRIV-FINAL-001 — regression suite for the public/operator DTO serializers
 * that sit between `GET /api/help-requests` / `GET /api/reports` (and their
 * raw Prisma rows) and the HTTP response. These are pure functions tested
 * without any database: the goal is to lock in exactly which fields a
 * public/anonymous caller can see vs. an operator.
 */

const FORBIDDEN_PUBLIC_KEYS = [
  "description",
  "latitude",
  "longitude",
  "locationText",
  "title",
  "userId",
  "phone",
  "email",
  "falseReportRisk",
  "aiRecommendation",
];

function assertNoForbiddenKeys(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const key of FORBIDDEN_PUBLIC_KEYS) {
    expect(serialized).not.toContain(`"${key}"`);
  }
}

const baseHelpRequest = {
  id: "hr-1",
  userId: "user-1",
  category: "medical",
  title: "Necesito ayuda urgente en mi domicilio",
  description: "Persona atrapada en calle Falsa 123, casa roja, portón verde",
  latitude: -33.44891,
  longitude: -70.66932,
  locationText: "Calle Falsa 123, Santiago",
  priority: "HIGH",
  status: "RECEIVED",
  restrictedMode: false,
  aiSummary: "Solicitud de ayuda clasificada como alta basada en la descripción.",
  aiRecommendation: "Enviar unidad de apoyo y coordinar con operadores locales.",
  aiConfidence: 82,
  createdAt: new Date("2026-07-10T10:00:00.000Z"),
  updatedAt: new Date("2026-07-10T10:05:00.000Z"),
  user: { publicAlias: "Vecino-1234" },
};

const baseReport = {
  id: "rep-1",
  userId: "user-2",
  category: "fire",
  title: "Incendio en Av. Siempre Viva 742",
  description: "Columna de humo visible desde la casa de al lado, contacto: 555-1234",
  latitude: -33.44891,
  longitude: -70.66932,
  locationText: "Av. Siempre Viva 742",
  severity: "HIGH",
  status: "NEW",
  aiSummary: "Análisis preliminar de la alerta: se detecta un posible evento de fire con prioridad high.",
  aiRecommendation: "Recomendado: enviar equipo de respuesta a la ubicación reportada.",
  aiConfidence: 75,
  falseReportRisk: 18,
  createdAt: new Date("2026-07-10T11:00:00.000Z"),
  updatedAt: new Date("2026-07-10T11:05:00.000Z"),
  user: { publicAlias: "Ciudadano-5678" },
};

describe("toPublicHelpRequest", () => {
  it("omite description, latitude/longitude exactas, locationText, title y contacto", () => {
    const result = toPublicHelpRequest(baseHelpRequest);
    assertNoForbiddenKeys(result);
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("locationText");
    expect(result).not.toHaveProperty("title");
    expect(result).not.toHaveProperty("userId");
  });

  it("nunca expone las coordenadas exactas originales", () => {
    const result = toPublicHelpRequest(baseHelpRequest);
    expect(result.approximateLocation).not.toEqual({
      lat: baseHelpRequest.latitude,
      lng: baseHelpRequest.longitude,
    });
    expect(result.approximateLocation).toEqual({ lat: -33.4, lng: -70.7 });
  });

  it("respeta restrictedMode: oculta también la ubicación aproximada", () => {
    const result = toPublicHelpRequest({ ...baseHelpRequest, restrictedMode: true });
    expect(result.isRestricted).toBe(true);
    expect(result.approximateLocation).toBeNull();
  });

  it("conserva campos públicos permitidos (id, status, category, priority)", () => {
    const result = toPublicHelpRequest(baseHelpRequest);
    expect(result.id).toBe("hr-1");
    expect(result.status).toBe("RECEIVED");
    expect(result.category).toBe("medical");
    expect(result.priority).toBe("HIGH");
  });

  it("no muta el objeto de entrada", () => {
    const clone = { ...baseHelpRequest };
    toPublicHelpRequest(clone);
    expect(clone).toEqual(baseHelpRequest);
  });

  it("maneja un registro antiguo con campos nulos/ausentes sin romperse", () => {
    const legacy = {
      id: "hr-legacy",
      status: "RECEIVED",
      category: null,
      priority: null,
      restrictedMode: null,
      latitude: null,
      longitude: null,
      createdAt: null,
      aiSummary: null,
    };
    expect(() => toPublicHelpRequest(legacy)).not.toThrow();
    const result = toPublicHelpRequest(legacy);
    expect(result.approximateLocation).toBeNull();
    expect(result.isRestricted).toBe(false);
  });
});

describe("toOperatorHelpRequest", () => {
  it("conserva el detalle completo permitido para operador", () => {
    const result = toOperatorHelpRequest(baseHelpRequest);
    expect(result.description).toBe(baseHelpRequest.description);
    expect(result.locationText).toBe(baseHelpRequest.locationText);
    expect(result.latitude).toBe(baseHelpRequest.latitude);
    expect(result.longitude).toBe(baseHelpRequest.longitude);
    expect(result.author).toBe("Vecino-1234");
  });

  it("no muta el objeto de entrada", () => {
    const clone = { ...baseHelpRequest };
    toOperatorHelpRequest(clone);
    expect(clone).toEqual(baseHelpRequest);
  });
});

describe("toPublicReport", () => {
  it("omite texto completo (title/description), locationText, identidad y metadata de moderación", () => {
    const result = toPublicReport(baseReport);
    assertNoForbiddenKeys(result);
    expect(result).not.toHaveProperty("title");
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("locationText");
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("falseReportRisk");
  });

  it("nunca expone coordenadas exactas", () => {
    const result = toPublicReport(baseReport);
    expect(result.approximateLocation).not.toEqual({ lat: baseReport.latitude, lng: baseReport.longitude });
    expect(result.approximateLocation).toEqual({ lat: -33.45, lng: -70.67 });
  });

  it("conserva campos públicos permitidos (categoría, severidad, estado, verificación)", () => {
    const result = toPublicReport(baseReport);
    expect(result.category).toBe("fire");
    expect(result.severity).toBe("HIGH");
    expect(result.status).toBe("NEW");
    expect(result.verified).toBe(false);
  });

  it("marca verified=true solo cuando status es VALIDATED", () => {
    const result = toPublicReport({ ...baseReport, status: "VALIDATED" });
    expect(result.verified).toBe(true);
  });

  it("no muta el objeto de entrada", () => {
    const clone = { ...baseReport };
    toPublicReport(clone);
    expect(clone).toEqual(baseReport);
  });

  it("maneja un registro antiguo con campos nulos/ausentes sin romperse", () => {
    const legacy = { id: "rep-legacy" };
    expect(() => toPublicReport(legacy)).not.toThrow();
    const result = toPublicReport(legacy);
    expect(result.approximateLocation).toBeNull();
    expect(result.status).toBe("UNKNOWN");
  });
});

describe("toOperatorReport", () => {
  it("conserva el detalle completo permitido para operador", () => {
    const result = toOperatorReport(baseReport);
    expect(result.description).toBe(baseReport.description);
    expect(result.title).toBe(baseReport.title);
    expect(result.locationText).toBe(baseReport.locationText);
    expect(result.falseReportRisk).toBe(18);
    expect(result.author).toBe("Ciudadano-5678");
  });

  it("no muta el objeto de entrada", () => {
    const clone = { ...baseReport };
    toOperatorReport(clone);
    expect(clone).toEqual(baseReport);
  });
});
