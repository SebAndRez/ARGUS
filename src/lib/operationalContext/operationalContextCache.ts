import type { OperationalContextPackage } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 11 (Performance).
 *
 * Cache en memoria de proceso, por `incidentId`. Nunca se invoca desde
 * Global Watch / cron (`runGlobalWatch`, `run-global-watch` job) — solo el
 * endpoint on-demand `GET /api/operational-context/[incidentId]` lo toca, así
 * que no puede agregar latencia a la ingesta. Invalida por *fingerprint*
 * (updatedAt + severity + lifecycle del incidente), no solo por TTL de
 * reloj: si el incidente realmente cambió, el resultado viejo nunca se
 * reutiliza aunque el TTL no haya vencido.
 */

const TTL_MS = 5 * 60_000;

interface CacheEntry {
  fingerprint: string;
  contextPackage: OperationalContextPackage;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function buildIncidentFingerprint(incident: { updatedAt: string; severity: string; lifecycle: string }): string {
  return `${incident.updatedAt}|${incident.severity}|${incident.lifecycle}`;
}

export function getCachedOperationalContext(incidentId: string, fingerprint: string): OperationalContextPackage | undefined {
  const entry = cache.get(incidentId);
  if (!entry) return undefined;
  if (entry.fingerprint !== fingerprint || entry.expiresAt <= Date.now()) {
    cache.delete(incidentId);
    return undefined;
  }
  return entry.contextPackage;
}

export function setCachedOperationalContext(incidentId: string, fingerprint: string, contextPackage: OperationalContextPackage): void {
  cache.set(incidentId, { fingerprint, contextPackage, expiresAt: Date.now() + TTL_MS });
}

/** Solo para tests — evita fugas de estado entre casos. */
export function clearOperationalContextCache(): void {
  cache.clear();
}
