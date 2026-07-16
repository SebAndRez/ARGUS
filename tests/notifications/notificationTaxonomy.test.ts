import { describe, expect, it } from "vitest";
import {
  GLOBAL_WATCH_PRIORITY_CAP,
  buildArgusNotifications,
  buildNotificationSummary,
  categoryPriorityRank,
  dedupeOperationalNotifications,
  filterAuthorizedNotifications,
  prioritizeGlobalWatchNotifications,
  type KnowledgeIncidentItem,
} from "../../src/lib/notifications/notificationCenterEngine";
import type { CrisisEvent } from "../../src/types/crisis";
import type { ArgusNormalizedEvent } from "../../src/types/ingestion";
import type { ConflictEvent } from "../../src/types/conflictZone";
import type { ArgusNotification } from "../../src/types/notificationCenter";
import { notificationCategoryLabels } from "../../src/lib/notifications/notificationVisuals";

/**
 * Regression suite for Prompt 11 — canonical notification classification.
 * Purely in-memory fixtures against `notificationCenterEngine.ts` (no
 * Prisma, no network; `tests/setup.ts` blocks any unmocked `fetch()`).
 * Covers §21 Casos 1-15 (taxonomy, priority, counters, serialization,
 * compatibility, accessibility) at the engine level, and §22 exercises the
 * one true I/O boundary (`/api/notifications`) in
 * `notificationsEndpoint.test.ts`.
 */

function knowledgeIncident(overrides: Partial<KnowledgeIncidentItem> = {}): KnowledgeIncidentItem {
  return {
    id: "ki-1",
    externalId: "senapred-1",
    title: "Alerta roja incendio forestal",
    summary: "SENAPRED declara alerta roja.",
    domain: "wildfire",
    subtype: null,
    severity: "critical",
    confidenceScore: 90,
    sourceId: "senapred_eventos",
    sourceName: "SENAPRED Chile",
    country: "CL",
    region: "Valparaiso",
    locality: null,
    latitude: -33.05,
    longitude: -71.62,
    occurredAt: new Date("2026-07-14T10:00:00.000Z"),
    detectedAt: new Date("2026-07-14T10:02:00.000Z"),
    createdAt: new Date("2026-07-14T10:02:30.000Z"),
    updatedAt: new Date("2026-07-14T10:05:00.000Z"),
    tagsJson: [],
    technicalFactorsJson: { lifecycle: "active" },
    impactJson: null,
    casualtiesJson: null,
    ...overrides,
  };
}

function reportEvent(overrides: Partial<CrisisEvent> = {}): CrisisEvent {
  return {
    id: "report-1",
    title: "Reporte ciudadano de humo",
    category: "Incendio",
    description: "Se observa humo denso.",
    latitude: -33.4,
    longitude: -70.6,
    severity: "MEDIUM",
    type: "REPORT",
    status: "NEW",
    createdAt: new Date().toISOString(),
    aiConfidence: 55,
    ...overrides,
  } as CrisisEvent;
}

function externalEvent(overrides: Partial<ArgusNormalizedEvent> = {}): ArgusNormalizedEvent {
  return {
    id: "ext-1",
    sourceId: "usgs_earthquake",
    sourceName: "USGS",
    externalId: "us7000abcd",
    title: "M6.5 earthquake",
    description: "Offshore earthquake",
    category: "earthquake",
    severity: "critical",
    confidence: 95,
    latitude: -33.0,
    longitude: -71.5,
    occurredAt: new Date().toISOString(),
    isExternal: true,
    ...overrides,
  } as ArgusNormalizedEvent;
}

function conflictEvent(overrides: Partial<ConflictEvent> = {}): ConflictEvent {
  return {
    id: "conflict-1",
    title: "Ataque reportado",
    eventType: "airstrike",
    lat: 31.5,
    lng: 34.4,
    country: "PS",
    region: "Gaza",
    occurredAt: new Date().toISOString(),
    sourceName: "GDELT feed",
    confidence: "high",
    severity: "high",
    rawProvider: "gdelt",
    ...overrides,
  };
}

describe("Prompt 11 — clasificación canónica por origen", () => {
  it("Caso 1 — SENAPRED oficial: official_alert / official / isOfficial true", () => {
    const [n] = buildArgusNotifications({ knowledgeIncidents: [knowledgeIncident()] });
    expect(n.category).toBe("official_alert");
    expect(n.verificationStatus).toBe("official");
    expect(n.isOfficial).toBe(true);
  });

  it("Caso 2 — USGS (ExternalEvent) confirmado: oficial, nunca predicción, nunca demo", () => {
    const [n] = buildArgusNotifications({ externalEvents: [externalEvent()] });
    expect(n.category).toBe("official_alert");
    expect(n.verificationStatus).toBe("official");
    expect(n.category).not.toBe("prediction");
    expect(n.isDemo).not.toBe(true);
  });

  it("open-data ExternalEvent (no reconocido como oficial): confirmed_incident / corroborated", () => {
    const [n] = buildArgusNotifications({
      externalEvents: [externalEvent({ id: "ext-2", sourceId: "gdacs", externalId: "gdacs-1" })],
    });
    expect(n.category).toBe("confirmed_incident");
    expect(n.verificationStatus).toBe("corroborated");
    expect(n.isOfficial).toBe(false);
  });

  it("Caso 3 — reporte ciudadano nuevo: citizen_report / unverified", () => {
    const [n] = buildArgusNotifications({ events: [reportEvent()] });
    expect(n.category).toBe("citizen_report");
    expect(n.verificationStatus).toBe("unverified");
    expect(n.isOfficial).toBe(false);
  });

  it("reporte ciudadano validado: citizen_report / corroborated (nunca official_alert)", () => {
    const [n] = buildArgusNotifications({ events: [reportEvent({ status: "VALIDATED" })] });
    expect(n.category).toBe("citizen_report");
    expect(n.verificationStatus).toBe("corroborated");
    expect(n.category).not.toBe("official_alert");
  });

  it("reporte ciudadano descartado: verificationStatus rejected", () => {
    const [n] = buildArgusNotifications({ events: [reportEvent({ status: "DISCARDED" })] });
    expect(n.verificationStatus).toBe("rejected");
  });

  it("Caso 5 — análisis ARGUS (KnowledgeIncident sin fuente reconocida): candidate_signal, isOfficial false", () => {
    const [n] = buildArgusNotifications({
      knowledgeIncidents: [knowledgeIncident({ id: "ki-2", sourceId: "unknown_source", severity: "high" })],
    });
    expect(n.category).toBe("candidate_signal");
    expect(n.isOfficial).toBe(false);
  });

  it("Caso 6 — Source Health: categoría propia, nunca cuenta como incidente crítico", () => {
    const [n] = buildArgusNotifications({
      sourceHealth: [{ sourceId: "nasa_firms", status: "error", warnings: ["timeout"] }],
    });
    expect(n.category).toBe("source_health");
    expect(n.verificationStatus).toBeUndefined();
    const summary = buildNotificationSummary([n]);
    expect(summary.critical).toBe(0);
    expect(summary.high).toBe(0);
  });

  it("Caso 7 — Recordatorio VESTA: categoría propia, no entra al contador de crisis", () => {
    const [n] = buildArgusNotifications({
      reminders: [{ id: "rem-1", title: "Botiquin", dueAt: new Date(Date.now() - 20 * 86400000), status: "pending" }],
    });
    expect(n.category).toBe("preparedness_reminder");
    const summary = buildNotificationSummary([n]);
    expect(summary.critical).toBe(0);
  });

  it("candidato curado (ATLAS manual_curated): candidate_signal, no confirmed_incident", () => {
    const [n] = buildArgusNotifications({ conflictEvents: [conflictEvent({ rawProvider: "manual_curated" })] });
    expect(n.category).toBe("candidate_signal");
    expect(n.verificationStatus).toBe("candidate");
  });

  it("evento de conflicto vía feed (no curado): confirmed_incident", () => {
    const [n] = buildArgusNotifications({ conflictEvents: [conflictEvent({ rawProvider: "gdelt" })] });
    expect(n.category).toBe("confirmed_incident");
  });
});

describe("Caso 4 — predicción nunca es oficial", () => {
  it("category:prediction, isOfficial:false, aunque la severidad sea crítica", () => {
    const prediction: ArgusNotification = {
      ...buildArgusNotifications({ events: [reportEvent()] })[0],
      id: "predictive-1",
      severity: "P0_CRITICAL",
      category: "prediction",
      verificationStatus: "model_generated",
      isOfficial: false,
    };
    expect(prediction.category).toBe("prediction");
    expect(prediction.isOfficial).toBe(false);
    const summary = buildNotificationSummary([prediction]);
    // A P0_CRITICAL prediction must NOT count toward the operational critical counter.
    expect(summary.critical).toBe(0);
  });
});

describe("Caso 8 — datos demo", () => {
  it("un evento marcado isDemo se degrada a category:demo, isOfficial:false, sin verificationStatus", () => {
    const [demoNotification] = buildArgusNotifications({
      events: [reportEvent({ id: "report-demo", severity: "CRITICAL", isDemo: true })],
    });
    expect(demoNotification.isDemo).toBe(true);
    expect(demoNotification.category).toBe("demo");
    expect(demoNotification.isOfficial).toBe(false);
    expect(demoNotification.verificationStatus).toBeUndefined();
  });

  it("excluido cuando no está autorizado: nunca ocupa slot ni cuenta como crítico", () => {
    const built = buildArgusNotifications({
      events: [reportEvent({ id: "report-demo-2", severity: "CRITICAL", isDemo: true })],
    });
    const filtered = filterAuthorizedNotifications(built, false);
    expect(filtered).toHaveLength(0);
  });
});

describe("Caso 9 — prioridad: alerta oficial alta antes que predicción crítica", () => {
  it("categoryPriorityRank ordena official_alert P1_HIGH por delante de prediction P0_CRITICAL", () => {
    const officialHigh: ArgusNotification = {
      ...buildArgusNotifications({ knowledgeIncidents: [knowledgeIncident({ severity: "high" })] })[0],
      severity: "P1_HIGH",
    };
    const predictionCritical: ArgusNotification = {
      ...officialHigh,
      id: "predictive-critical",
      category: "prediction",
      verificationStatus: "model_generated",
      isOfficial: false,
      severity: "P0_CRITICAL",
    };
    expect(categoryPriorityRank(officialHigh)).toBeLessThan(categoryPriorityRank(predictionCritical));
  });
});

describe("Caso 10 — slots: predicciones no desplazan alertas oficiales", () => {
  it("prioritizeGlobalWatchNotifications reserva slots solo para knowledge-incident-*", () => {
    // Distinct lat/lng per item so `dedupeOperationalNotifications`'s
    // type:lat:lng:6h-bucket signature doesn't collapse the fixtures into one.
    const officials = Array.from({ length: 5 }, (_, i) =>
      buildArgusNotifications({
        knowledgeIncidents: [
          knowledgeIncident({ id: `ki-official-${i}`, severity: "critical", latitude: -30 - i, longitude: -70 - i }),
        ],
      })[0]
    );
    const predictions: ArgusNotification[] = Array.from({ length: 50 }, (_, i) => ({
      ...officials[0],
      id: `predictive-${i}`,
      lat: -10 - i,
      lng: -50 - i,
      category: "prediction",
      verificationStatus: "model_generated",
      isOfficial: false,
    }));

    const result = prioritizeGlobalWatchNotifications([...predictions, ...officials], 10);
    const officialIds = new Set(officials.map((o) => o.id));
    const survivingOfficials = result.filter((n) => officialIds.has(n.id));
    expect(survivingOfficials).toHaveLength(5);
    expect(GLOBAL_WATCH_PRIORITY_CAP).toBeGreaterThan(0);
  });
});

describe("Caso 11 — contador crítico solo cuenta oficiales/confirmados vigentes", () => {
  it("excluye prediction/argus_analysis/source_health/reminder/candidate/citizen_report/demo", () => {
    const official = buildArgusNotifications({
      knowledgeIncidents: [knowledgeIncident({ severity: "critical" })],
    })[0];
    const candidate = buildArgusNotifications({
      knowledgeIncidents: [knowledgeIncident({ id: "ki-candidate", sourceId: "unknown", severity: "critical" })],
    })[0];
    const citizen: ArgusNotification = {
      ...buildArgusNotifications({ events: [reportEvent({ severity: "CRITICAL" })] })[0],
      severity: "P0_CRITICAL",
    };
    const sourceHealth = buildArgusNotifications({
      sourceHealth: [{ sourceId: "x", status: "error" }],
    })[0];
    const reminder = buildArgusNotifications({
      reminders: [{ id: "r1", title: "x", dueAt: new Date(), status: "pending" }],
    })[0];
    const prediction: ArgusNotification = {
      ...official,
      id: "predictive-x",
      category: "prediction",
      verificationStatus: "model_generated",
      isOfficial: false,
    };

    const summary = buildNotificationSummary([
      official,
      candidate,
      citizen,
      sourceHealth,
      reminder,
      prediction,
    ]);
    expect(summary.critical).toBe(1);
    expect(summary.total).toBe(6);
  });
});

describe("Caso 12 — lifecycle resuelto no entra al contador activo", () => {
  it("un official_alert RESOLVED no cuenta como crítico aunque severity sea P0_CRITICAL", () => {
    const [n] = buildArgusNotifications({
      knowledgeIncidents: [
        knowledgeIncident({ severity: "critical", technicalFactorsJson: { lifecycle: "resolved" } }),
      ],
    });
    expect(n.status).toBe("RESOLVED");
    const summary = buildNotificationSummary([n]);
    expect(summary.critical).toBe(0);
  });
});

describe("Caso 13 — categoría serializada", () => {
  it("cada notificación trae category/verificationStatus/isOfficial sin necesidad de inferencia", () => {
    const notifications = buildArgusNotifications({
      knowledgeIncidents: [knowledgeIncident()],
      events: [reportEvent()],
      sourceHealth: [{ sourceId: "s", status: "ready" }],
      reminders: [{ id: "r", title: "t", dueAt: new Date(), status: "pending" }],
    });
    notifications.forEach((n) => {
      expect(typeof n.category).toBe("string");
      expect(n).toHaveProperty("isOfficial");
    });
  });

  it("buildNotificationSummary serializa byCategory con las 11 claves canónicas", () => {
    const [n] = buildArgusNotifications({ knowledgeIncidents: [knowledgeIncident()] });
    const summary = buildNotificationSummary([n]);
    expect(Object.keys(summary.byCategory).sort()).toEqual(
      [
        "argus_analysis",
        "candidate_signal",
        "citizen_report",
        "confirmed_incident",
        "demo",
        "official_alert",
        "preparedness_reminder",
        "prediction",
        "recommendation",
        "source_health",
        "system_notice",
      ].sort()
    );
    expect(summary.byCategory.official_alert).toBe(1);
  });
});

describe("Caso 14 — compatibilidad con campos legacy", () => {
  it("sourceType y status siguen disponibles junto a category", () => {
    const [n] = buildArgusNotifications({ knowledgeIncidents: [knowledgeIncident()] });
    expect(n.sourceType).toBe("OFFICIAL");
    expect(n.status).toBeDefined();
    expect(n.category).toBe("official_alert");
  });
});

describe("Caso 15 — accesibilidad: la categoría es texto, no solo color", () => {
  it("todas las categorías canónicas tienen una etiqueta de texto asociada", () => {
    const categories = Object.keys(notificationCategoryLabels);
    expect(categories.length).toBe(11);
    categories.forEach((key) => {
      const label = notificationCategoryLabels[key as keyof typeof notificationCategoryLabels];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

describe("dedupeOperationalNotifications no introduce duplicados", () => {
  it("dedupe respeta la señal type:lat:lng:bucket6h existente", () => {
    const [a] = buildArgusNotifications({ knowledgeIncidents: [knowledgeIncident()] });
    const b: ArgusNotification = { ...a, id: "ki-duplicate" };
    const result = dedupeOperationalNotifications([a, b]);
    expect(result).toHaveLength(1);
  });
});
