import type { ArgusEvent } from "@/types/argusEvent";

/**
 * ARGUS — DATA-FINAL-001: estado consolidado de la capa de alertas
 * oficiales (`argusEvents`) que alimenta tanto el mapa 2D como Orbit.
 *
 * Antes de esta corrección, `src/app/app/page.tsx` sembraba el estado con
 * `demoArgusEvents` (`useState(demoArgusEvents)`), y ante CUALQUIER fallo de
 * `fetch("/api/argus/events")` (red caída, JSON inválido, respuesta no-ok)
 * volvía a sustituir la colección completa por `demoArgusEvents` — sin
 * consultar `isDemoDataAllowed()` — y encima podía concatenar eventos reales
 * de Chile Alerts / VIGÍA sobre esa base demo, produciendo una colección
 * mixta demo+real indistinguible en el mapa y en Orbit.
 *
 * `/api/argus/events` YA decide correctamente server-side si debe servir
 * datos demo (`source: "curated_demo"`, gateado por `isDemoDataAllowed()`)
 * o reales (`source: "senapred_persisted"`) — ver
 * `src/app/api/argus/events/route.ts`. Este módulo es la única pieza nueva:
 * el cliente NUNCA vuelve a decidir por su cuenta si mostrar demo (no
 * reimplementa `isDemoDataAllowed()`, que además no es evaluable de forma
 * confiable en el bundle de cliente — lee variables de entorno sin prefijo
 * `NEXT_PUBLIC_`), solo confía en la decisión ya tomada por el servidor a
 * través de `source`, y jamás sustituye un fallo por datos inventados.
 *
 * Pura, determinista, sin I/O — el fetch real vive en `page.tsx`; esta
 * función solo resuelve el estado a partir de los resultados ya obtenidos,
 * así se puede probar con Vitest sin red, sin DOM y sin `isDemoDataAllowed`.
 */

export type ArgusEventsDataStatus =
  | "loading"
  | "available"
  | "empty"
  | "partial"
  | "unavailable"
  | "demo";

export interface ArgusEventsDataState {
  status: ArgusEventsDataStatus;
  events: ArgusEvent[];
  /** Etiquetas de fuentes que fallaron (solo relevante en "partial"/"unavailable"). */
  failedSources: string[];
}

export const ARGUS_EVENTS_LOADING_STATE: ArgusEventsDataState = {
  status: "loading",
  events: [],
  failedSources: [],
};

export type ArgusEventsSourceOutcome =
  | { status: "success"; events: ArgusEvent[] }
  | { status: "failed" };

export interface ArgusEventsBaseSource {
  outcome: ArgusEventsSourceOutcome;
  /**
   * `true` cuando el servidor (`/api/argus/events`, campo `source`) ya
   * decidió que la colección devuelta es demo — la única señal de demo que
   * este módulo acepta.
   */
  isDemo: boolean;
}

export interface ArgusEventsSupplementalSource {
  /** Etiqueta legible para logging/UI, p.ej. "chile_alerts", "vigia_events". */
  label: string;
  outcome: ArgusEventsSourceOutcome;
}

export interface ResolveArgusEventsDataStateInput {
  /** Resultado de `/api/argus/events` — la fuente base/primaria. */
  base: ArgusEventsBaseSource;
  /**
   * Fuentes reales adicionales (Chile Alerts, VIGÍA). Siempre reales por
   * contrato: ambos endpoints ya excluyen eventos demo salvo
   * `?includeDemo=true` (que este cliente nunca envía) — así que no aportan
   * un flag `isDemo` propio; si `base.isDemo` es `true`, se ignoran por
   * completo (regla preferida §4: "demo mode → demo collection only").
   */
  extras?: ArgusEventsSupplementalSource[];
}

const REPORT_ID_KEY = (event: ArgusEvent) => event.id;

export function resolveArgusEventsDataState(
  input: ResolveArgusEventsDataStateInput
): ArgusEventsDataState {
  const { base, extras = [] } = input;

  // Demo autorizada y servida por el servidor: colección aislada, nunca
  // mezclada con fuentes reales adicionales.
  if (base.outcome.status === "success" && base.isDemo) {
    return { status: "demo", events: base.outcome.events, failedSources: [] };
  }

  const failedSources: string[] = [];
  let events: ArgusEvent[] = [];
  let anySucceeded = false;

  if (base.outcome.status === "success") {
    anySucceeded = true;
    events = base.outcome.events;
  } else {
    failedSources.push("argus_events");
  }

  const seenIds = new Set(events.map(REPORT_ID_KEY));
  for (const extra of extras) {
    if (extra.outcome.status === "success") {
      anySucceeded = true;
      const additional = extra.outcome.events.filter((event) => !seenIds.has(event.id));
      additional.forEach((event) => seenIds.add(event.id));
      events = events.concat(additional);
    } else {
      failedSources.push(extra.label);
    }
  }

  if (!anySucceeded) {
    return { status: "unavailable", events: [], failedSources };
  }
  if (failedSources.length > 0) {
    return { status: "partial", events, failedSources };
  }
  return { status: events.length > 0 ? "available" : "empty", events, failedSources: [] };
}
