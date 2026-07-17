import { describe, expect, it, vi } from "vitest";

/**
 * Ciclo de vida de publicacion (spec ARGUS v1.0.3.5 §15): active -> missing
 * -> stale -> archived, segun `CriticalPoi.lastSeenAt`. Nunca se borra un
 * registro. `@/lib/prisma` se mockea porque el modulo lo importa a nivel
 * de carga (no se ejercita `sweepShelterPublicationStatus` aca, solo la
 * funcion pura).
 */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computePublicationStatus, PUBLICATION_TTL_HOURS } from "@/lib/criticalPoi/shelterStatusLifecycle";

describe("computePublicationStatus", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("visto recientemente -> active", () => {
    expect(computePublicationStatus({ lastSeenAt: now, now })).toBe("active");
  });

  it("sin lastSeenAt (nunca visto) -> active por defecto, nunca inventa una ausencia", () => {
    expect(computePublicationStatus({ lastSeenAt: null, now })).toBe("active");
  });

  it("pasada la ventana 'missing' (24h) pero no 'stale' -> missing", () => {
    const lastSeenAt = new Date(now.getTime() - (PUBLICATION_TTL_HOURS.missing + 1) * 60 * 60 * 1000);
    expect(computePublicationStatus({ lastSeenAt, now })).toBe("missing");
  });

  it("pasada la ventana 'stale' (72h) pero no 'archived' -> stale", () => {
    const lastSeenAt = new Date(now.getTime() - (PUBLICATION_TTL_HOURS.stale + 1) * 60 * 60 * 1000);
    expect(computePublicationStatus({ lastSeenAt, now })).toBe("stale");
  });

  it("pasada la ventana 'archived' (30 dias) -> archived", () => {
    const lastSeenAt = new Date(now.getTime() - (PUBLICATION_TTL_HOURS.archived + 1) * 60 * 60 * 1000);
    expect(computePublicationStatus({ lastSeenAt, now })).toBe("archived");
  });

  it("justo en el umbral (no superado) no transiciona", () => {
    const lastSeenAt = new Date(now.getTime() - PUBLICATION_TTL_HOURS.missing * 60 * 60 * 1000);
    expect(computePublicationStatus({ lastSeenAt, now })).toBe("active");
  });
});
