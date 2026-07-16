import { getRecentIngestionRunsBySource } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { classifySourceError } from "@/lib/vigia/sourceScheduler";
import {
  ARGUS_SOURCE_OPERATIONS_REGISTRY,
  deriveSourceOperationalStatus,
  isSourceConfigured,
  toOperatorSourceHealth,
  toPublicSourceHealth,
  type ArgusSourceDefinition,
  type OperatorSourceHealthEntry,
  type PublicSourceHealthEntry,
  type SourceHealthSignal,
  type SourceOperationalVerdict,
} from "@/lib/vigia/sourceOperationsRegistry";

/**
 * ARGUS Prompt 16 — agrega el registro canónico (capacidad) con la señal de
 * ejecución real (`KnowledgeIngestionRun`) para producir Source Health
 * dinámico. Aislado del registro puro (`sourceOperationsRegistry.ts`) para
 * que ese archivo siga siendo testeable sin base de datos — este archivo es
 * el único punto de I/O de esta capa.
 */

type IngestionRunRow = { status: string; startedAt: Date; finishedAt: Date | null; errorMessage: string | null; recordsFetched: number };

/** Ventana global acotada (Prompt 16 §23) — recency-biased entre ~43 fuentes: las de mayor cadencia dominan la ventana, lo cual es aceptable porque el objetivo es "estado actual", no historial completo por fuente. */
const HEALTH_RUN_WINDOW = 400;

function buildHealthSignal(source: ArgusSourceDefinition, runs: IngestionRunRow[] | undefined): SourceHealthSignal {
  const list = runs ?? [];
  const lastRun = list[0] ?? null;
  let lastSuccessAt: Date | null = null;
  let lastFailureAt: Date | null = null;
  let consecutiveFailures = 0;
  let lastErrorCode: SourceHealthSignal["lastErrorCode"] = null;

  for (const run of list) {
    if (run.status === "failed") {
      consecutiveFailures += 1;
      lastFailureAt ??= run.startedAt;
      lastErrorCode ??= classifySourceError(new Error(run.errorMessage ?? "unknown"));
      continue;
    }
    if (run.status === "success" || run.status === "partial") {
      lastSuccessAt = run.startedAt;
      break;
    }
    // Estados neutros (skipped/requiresConfiguration/requiresApiKey): se
    // ignoran para no romper ni extender artificialmente la racha de
    // fallos, se sigue buscando el último éxito hacia atrás.
  }

  return {
    lastAttemptAt: lastRun?.startedAt ?? null,
    lastSuccessAt,
    lastFailureAt,
    lastDurationMs: lastRun?.finishedAt ? lastRun.finishedAt.getTime() - lastRun.startedAt.getTime() : null,
    lastRecordCount: lastRun ? lastRun.recordsFetched : null,
    consecutiveFailures,
    lastErrorCode,
    credentialsConfigured: isSourceConfigured(source),
  };
}

export type SourceOperationsHealthEntry = {
  source: ArgusSourceDefinition;
  signal: SourceHealthSignal;
  verdict: SourceOperationalVerdict;
};

export async function getSourceOperationsHealth(now: Date = new Date()): Promise<SourceOperationsHealthEntry[]> {
  const ids = ARGUS_SOURCE_OPERATIONS_REGISTRY.map((source) => source.id);
  const runsBySource = await getRecentIngestionRunsBySource(ids, HEALTH_RUN_WINDOW);
  return ARGUS_SOURCE_OPERATIONS_REGISTRY.map((source) => {
    const signal = buildHealthSignal(source, runsBySource.get(source.id));
    const verdict = deriveSourceOperationalStatus(source, signal, now);
    return { source, signal, verdict };
  });
}

export async function getPublicSourceHealthList(now: Date = new Date()): Promise<PublicSourceHealthEntry[]> {
  const entries = await getSourceOperationsHealth(now);
  return entries.map(({ source, verdict }) => toPublicSourceHealth(source, verdict));
}

export async function getOperatorSourceHealthList(now: Date = new Date()): Promise<OperatorSourceHealthEntry[]> {
  const entries = await getSourceOperationsHealth(now);
  return entries.map(({ source, signal, verdict }) => toOperatorSourceHealth(source, signal, verdict));
}
