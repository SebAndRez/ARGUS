import { describe, expect, it } from "vitest";
import { withEnv } from "../helpers/withEnv";
import { isDemoDataAllowed } from "../../src/lib/security/productionGuard";
import {
  buildArgusNotifications,
  buildNotificationSummary,
  filterAuthorizedNotifications,
  resolveDemoFallback,
} from "../../src/lib/notifications/notificationCenterEngine";
import type { CrisisEvent } from "../../src/types/crisis";
import type { ArgusRoute } from "../../src/types/map";

/**
 * Regression suite for the Prompt 3 fix: `/api/notifications` must never
 * present demoEvents/demoRoutes as real in production, must not depend on
 * "demo" appearing in any text field, and excluded demo items must never
 * influence slots/counts/summary. Purely in-memory (no Prisma, no fetch) —
 * `notificationCenterEngine.ts` and `productionGuard.ts` have no I/O.
 */

function realEvent(): CrisisEvent {
  return {
    id: "real-1",
    title: "Incendio confirmado en Rancagua",
    category: "Incendio",
    description: "Reporte ciudadano verificado.",
    latitude: -34.17,
    longitude: -70.74,
    severity: "HIGH",
    type: "REPORT",
    status: "NEW",
    createdAt: new Date().toISOString(),
    aiConfidence: 80,
  } as CrisisEvent;
}

function demoEventCritical(): CrisisEvent {
  return {
    id: "event-1",
    title: "Incendio critico en San Bernardo",
    category: "Incendio",
    description: "Evento de demostracion.",
    latitude: -33.6192,
    longitude: -70.6325,
    severity: "CRITICAL",
    type: "REPORT",
    status: "UNDER_REVIEW",
    createdAt: new Date().toISOString(),
    aiConfidence: 92,
    isDemo: true,
  } as CrisisEvent;
}

/** Case E fixture: isDemo:true with no "demo"/"placeholder"/etc. anywhere in its text. */
function demoEventWithNeutralText(): CrisisEvent {
  return {
    id: "event-clean",
    title: "Reporte de verificacion interna",
    category: "Infraestructura",
    description: "Contenido neutro, sin coincidencias de texto sensibles.",
    latitude: -33.1,
    longitude: -70.5,
    severity: "CRITICAL",
    type: "REPORT",
    status: "NEW",
    createdAt: new Date().toISOString(),
    aiConfidence: 50,
    isDemo: true,
  } as CrisisEvent;
}

function demoRoute(): ArgusRoute {
  return {
    id: "route-terrestrial-santiago-demo",
    title: "Corredor terrestre urbano demo",
    type: "terrestrial",
    coordinates: [[-33.4568, -70.7005]],
    status: "Operativa demo",
    confidence: 82,
    description: "Ruta de referencia.",
    isDemo: true,
  };
}

describe("isDemoDataAllowed (reused from src/lib/security/productionGuard.ts)", () => {
  it("Caso A — produccion sin ARGUS_ALLOW_DEMO_DATA: bloqueado", () => {
    withEnv({ VERCEL_ENV: "production", NODE_ENV: undefined, ARGUS_ALLOW_DEMO_DATA: undefined }, () => {
      expect(isDemoDataAllowed()).toBe(false);
    });
  });

  it("Caso B — produccion con ARGUS_ALLOW_DEMO_DATA=false: bloqueado", () => {
    withEnv({ VERCEL_ENV: "production", ARGUS_ALLOW_DEMO_DATA: "false" }, () => {
      expect(isDemoDataAllowed()).toBe(false);
    });
  });

  it.each(["1", "yes", "TRUE", "on"])("Caso C — valor ambiguo ARGUS_ALLOW_DEMO_DATA=%s: bloqueado", (value) => {
    withEnv({ VERCEL_ENV: "production", ARGUS_ALLOW_DEMO_DATA: value }, () => {
      expect(isDemoDataAllowed()).toBe(false);
    });
  });

  it('Caso D — valor exacto ARGUS_ALLOW_DEMO_DATA="true" en produccion: permitido', () => {
    withEnv({ VERCEL_ENV: "production", ARGUS_ALLOW_DEMO_DATA: "true" }, () => {
      expect(isDemoDataAllowed()).toBe(true);
    });
  });

  it("fuera de produccion, sin la variable: permitido (politica existente para desarrollo)", () => {
    withEnv({ VERCEL_ENV: undefined, NODE_ENV: undefined, ARGUS_ALLOW_DEMO_DATA: undefined }, () => {
      expect(isDemoDataAllowed()).toBe(true);
    });
  });
});

describe("filterAuthorizedNotifications + buildArgusNotifications (Prompt 3 exclusion gate)", () => {
  it("Caso A/1 — produccion sin permiso: excluye demoEvents y demoRoutes por completo", () => {
    const built = buildArgusNotifications({
      events: [realEvent(), demoEventCritical()],
      routes: [demoRoute()],
    });
    const filtered = filterAuthorizedNotifications(built, false);

    expect(filtered.some((n) => n.isDemo === true)).toBe(false);
    expect(filtered.map((n) => n.id)).toEqual(["argus-event-real-1"]);
  });

  it("Caso E — item demo con texto neutro (sin 'demo' en ningun campo) igual queda excluido", () => {
    const built = buildArgusNotifications({ events: [realEvent(), demoEventWithNeutralText()] });
    const filtered = filterAuthorizedNotifications(built, false);

    expect(filtered.map((n) => n.id)).toEqual(["argus-event-real-1"]);
  });

  it("demo permitido: los items demo se incluyen, conservan isDemo:true y nunca quedan como OFFICIAL/OPEN_DATA/INSTITUTIONAL", () => {
    const built = buildArgusNotifications({
      events: [realEvent(), demoEventCritical(), demoEventWithNeutralText()],
      routes: [demoRoute()],
    });
    const filtered = filterAuthorizedNotifications(built, true);
    const demoItems = filtered.filter((n) => n.isDemo === true);

    expect(demoItems).toHaveLength(3);
    demoItems.forEach((item) => {
      expect(item.isDemo).toBe(true);
      expect(["OFFICIAL", "OPEN_DATA", "INSTITUTIONAL"]).not.toContain(item.sourceType);
    });
  });

  it("Caso F — notificacion demo critica excluida no ocupa slots ni afecta el contador de criticas", () => {
    const built = buildArgusNotifications({ events: [realEvent(), demoEventCritical()] });
    const filtered = filterAuthorizedNotifications(built, false);
    const summary = buildNotificationSummary(filtered);

    // The excluded item had severity CRITICAL — if it leaked through, this
    // would be 1, not 0.
    expect(summary.critical).toBe(0);
    expect(summary.total).toBe(1);
  });

  it("Caso F (permitido) — notificacion demo critica incluida SI cuenta cuando el demo esta autorizado (no oculta, solo se marca)", () => {
    const built = buildArgusNotifications({ events: [realEvent(), demoEventCritical()] });
    const filtered = filterAuthorizedNotifications(built, true);
    const summary = buildNotificationSummary(filtered);

    expect(summary.total).toBe(2);
    expect(filtered.find((n) => n.id === "argus-event-event-1")?.isDemo).toBe(true);
  });
});

describe("resolveDemoFallback (Prompt 3 fail-closed fallback)", () => {
  it("Caso G — sin datos reales y demo no permitido: coleccion vacia, sin fallback", () => {
    const result = resolveDemoFallback<CrisisEvent>([], false, () => [demoEventCritical()]);
    expect(result).toEqual([]);
  });

  it("sin datos reales y demo permitido: usa el fallback", () => {
    const result = resolveDemoFallback<CrisisEvent>([], true, () => [demoEventCritical()]);
    expect(result).toHaveLength(1);
  });

  it("con datos reales presentes: nunca invoca el fallback, incluso si demo esta permitido", () => {
    let fallbackCalls = 0;
    const event = realEvent();
    const result = resolveDemoFallback<CrisisEvent>([event], true, () => {
      fallbackCalls += 1;
      return [demoEventCritical()];
    });
    expect(result).toEqual([event]);
    expect(fallbackCalls).toBe(0);
  });
});
