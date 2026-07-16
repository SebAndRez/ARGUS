import { logOperationalEvent } from "@/lib/observability/operationalEvents";

/**
 * ARGUS Prompt 19 §16 — razones normalizadas de descarte. Ningún dominio
 * (ingesta, correlación, proyección) debe inventar su propio vocabulario
 * ad hoc de "skipped"/"rejected" — este es el único conjunto de valores
 * permitido para telemetría de descarte nueva.
 */
export type DropReason =
  | "invalid_coordinates"
  | "invalid_geometry"
  | "missing_required_field"
  | "lifecycle_terminal"
  | "expired"
  | "demo_blocked"
  | "duplicate"
  | "correlated_into_existing"
  | "unsupported_type"
  | "unauthorized"
  | "rate_limited"
  | "locked"
  | "insufficient_confidence"
  | "out_of_scope";

/**
 * Acumula descartes durante una corrida/solicitud y emite **un solo** log
 * agregado (Prompt 19 §17: "puede usar contadores agregados por corrida...
 * en lugar de un log por registro"). No expone identificadores individuales
 * ni el contenido descartado — solo razón y conteo.
 */
export class DropAggregator {
  private readonly counts = new Map<DropReason, number>();

  record(reason: DropReason, amount = 1): void {
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + amount);
  }

  get total(): number {
    let sum = 0;
    for (const value of this.counts.values()) sum += value;
    return sum;
  }

  toSummary(): Partial<Record<DropReason, number>> {
    return Object.fromEntries(this.counts.entries()) as Partial<Record<DropReason, number>>;
  }

  /** No-op si nada se descartó — nunca emite un log vacío. */
  logSummary(input: { component: string; sourceId?: string; runId?: string; requestId?: string }): void {
    if (this.total === 0) return;
    logOperationalEvent({
      event: "events_dropped_total",
      level: "warn",
      component: input.component,
      sourceId: input.sourceId,
      runId: input.runId,
      requestId: input.requestId,
      count: this.total,
      detail: this.toSummary(),
    });
  }
}
