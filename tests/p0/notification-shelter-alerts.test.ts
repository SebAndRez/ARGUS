import { describe, expect, it } from "vitest";
import { buildArgusNotifications, type ShelterOperationalAlertItem } from "@/lib/notifications/notificationCenterEngine";

/**
 * Alertas operacionales de refugios plegadas en el motor de notificaciones
 * existente (spec ARGUS v1.0.3.4 §18) — no un segundo centro de alertas.
 * Puramente en memoria, sin Prisma ni red (`notificationCenterEngine.ts` no
 * importa `@/lib/prisma`).
 */

function alert(overrides: Partial<ShelterOperationalAlertItem> = {}): ShelterOperationalAlertItem {
  return {
    poiId: "poi-1",
    poiName: "Refugio Estadio",
    latitude: -33.46,
    longitude: -70.61,
    countryCode: "CL",
    shelterStatus: "available",
    routeStatus: "open",
    isStale: false,
    sourceType: "manual_operator",
    sourceName: "Operador ARGUS",
    confidence: 80,
    lastUpdatedAt: "2026-07-16T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildArgusNotifications — alertas de refugios", () => {
  it("refugio lleno produce una notificacion tipo SHELTER de severidad P2_MEDIUM", () => {
    const [notification] = buildArgusNotifications({ shelterAlerts: [alert({ shelterStatus: "full" })] });
    expect(notification.type).toBe("SHELTER");
    expect(notification.severity).toBe("P2_MEDIUM");
    expect(notification.title).toContain("Refugio lleno");
    expect(notification.category).toBe("system_notice");
  });

  it("refugio comprometido produce severidad P1_HIGH", () => {
    const [notification] = buildArgusNotifications({ shelterAlerts: [alert({ shelterStatus: "compromised" })] });
    expect(notification.severity).toBe("P1_HIGH");
    expect(notification.title).toContain("no recomendable");
  });

  it("ruta bloqueada tiene prioridad sobre el estado de capacidad en el titulo", () => {
    const [notification] = buildArgusNotifications({
      shelterAlerts: [alert({ shelterStatus: "near_capacity", routeStatus: "blocked" })],
    });
    expect(notification.severity).toBe("P1_HIGH");
    expect(notification.title).toContain("Ruta cortada");
  });

  it("dato desactualizado sin otro motivo -> severidad P3_LOW", () => {
    const [notification] = buildArgusNotifications({ shelterAlerts: [alert({ isStale: true })] });
    expect(notification.severity).toBe("P3_LOW");
    expect(notification.title).toContain("Dato desactualizado");
  });

  it("no genera notificacion falsa cuando no hay shelterAlerts", () => {
    const notifications = buildArgusNotifications({});
    expect(notifications.filter((item) => item.type === "SHELTER")).toHaveLength(0);
  });

  it("distancia se calcula cuando hay ubicacion del usuario", () => {
    const [notification] = buildArgusNotifications({
      shelterAlerts: [alert({ shelterStatus: "full", latitude: -33.46, longitude: -70.61 })],
      userLocation: { lat: -33.45, lng: -70.6, countryCode: "CL" },
    });
    expect(notification.distanceKm).not.toBeNull();
    expect(notification.distanceKm).toBeGreaterThan(0);
  });
});
