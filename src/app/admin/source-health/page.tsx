"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GlobalWatchSummary } from "@/lib/vigia/globalWatchEngine";
import type { VigiaSourceHealth, VigiaSourceHealthStatus } from "@/lib/vigia/sourceRegistry";

/**
 * ARGUS Global Watch — Source Health Dashboard.
 * Muestra, por fuente: estado (OK/WARN/ERROR/DISABLED), última
 * actualización, eventos obtenidos, incidentes creados, último error,
 * próxima ejecución estimada y botón "Forzar actualización" (POST
 * /api/vigia/run?source=<id>, requiere operador/admin — la API valida).
 */

type HealthResponse = {
  generatedAt: string;
  totals: { sources: number; ok: number; warn: number; error: number; disabled: number };
  sources: VigiaSourceHealth[];
};

const STATUS_STYLES: Record<VigiaSourceHealthStatus, string> = {
  OK: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
  WARN: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  ERROR: "border-rose-300/30 bg-rose-400/10 text-rose-200",
  DISABLED: "border-slate-300/20 bg-slate-400/10 text-slate-300",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

export default function SourceHealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<GlobalWatchSummary | null>(null);

  const loadHealth = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/vigia/source-health", { cache: "no-store" });
      const payload = (await response.json()) as HealthResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No fue posible cargar la salud de fuentes.");
      setHealth(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error cargando salud de fuentes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 60_000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const forceRefresh = useCallback(
    async (sourceId?: string) => {
      setRunningSource(sourceId ?? "__all__");
      setError(null);
      try {
        const query = sourceId ? `?source=${encodeURIComponent(sourceId)}` : "";
        const response = await fetch(`/api/vigia/run${query}`, { method: "POST" });
        const payload = (await response.json()) as GlobalWatchSummary & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "La ejecución manual falló.");
        setLastRunSummary(payload);
        await loadHealth();
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "La ejecución manual falló.");
      } finally {
        setRunningSource(null);
      }
    },
    [loadHealth]
  );

  const sortedSources = useMemo(() => {
    const order: Record<VigiaSourceHealthStatus, number> = { ERROR: 0, WARN: 1, OK: 2, DISABLED: 3 };
    return [...(health?.sources ?? [])].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  }, [health]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white xl:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">ARGUS Global Watch — Salud de fuentes</h1>
            <p className="text-sm text-slate-400">
              Estado operacional de las fuentes VIGÍA. Actualizado: {formatDateTime(health?.generatedAt ?? null)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/dashboard"
              className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white"
            >
              Volver a Command
            </a>
            <a
              href="/app"
              className="rounded border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20"
            >
              Abrir mapa
            </a>
            <button
              type="button"
              onClick={() => forceRefresh()}
              disabled={runningSource !== null}
              className="rounded border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {runningSource === "__all__" ? "Ejecutando Global Watch…" : "Ejecutar Global Watch ahora"}
            </button>
          </div>
        </div>

        {health ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Fuentes", value: health.totals.sources, style: "text-white" },
              { label: "OK", value: health.totals.ok, style: "text-emerald-300" },
              { label: "WARN", value: health.totals.warn, style: "text-amber-300" },
              { label: "ERROR", value: health.totals.error, style: "text-rose-300" },
              { label: "DISABLED", value: health.totals.disabled, style: "text-slate-400" },
            ].map((item) => (
              <div key={item.label} className="rounded border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p>
                <p className={`text-2xl font-bold ${item.style}`}>{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="rounded border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {lastRunSummary ? (
          <div className="rounded border border-cyan-300/20 bg-cyan-400/[0.06] px-4 py-3 text-sm text-cyan-100">
            Última ejecución manual ({lastRunSummary.seedMode ? "fixtures QA" : "en vivo"}): {lastRunSummary.status} ·{" "}
            {lastRunSummary.sourcesConsulted} fuentes · {lastRunSummary.incidentsCreated} incidentes nuevos ·{" "}
            {lastRunSummary.incidentsUpdated} actualizados · {lastRunSummary.evidenceCreated} evidencias ·{" "}
            {lastRunSummary.notificationsGenerated} notificaciones · {Math.round(lastRunSummary.durationMs / 1000)}s
          </div>
        ) : null}

        <div className="overflow-x-auto rounded border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Cobertura</th>
                <th className="px-4 py-3">Última actualización</th>
                <th className="px-4 py-3">Eventos</th>
                <th className="px-4 py-3">Incidentes (últ. corrida / total)</th>
                <th className="px-4 py-3">Último error</th>
                <th className="px-4 py-3">Próxima ejecución</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && !health ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Cargando salud de fuentes…
                  </td>
                </tr>
              ) : null}
              {sortedSources.map((source) => (
                <tr key={source.sourceId} className="border-b border-white/5 align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{source.name}</p>
                    <p className="text-xs text-slate-400">
                      {source.sourceId} · fiabilidad {source.reliabilityScore}
                      {source.isOfficial ? " · oficial" : ""} · rol {source.role}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{source.threatTypes.join(", ")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded border px-2 py-1 text-xs font-bold ${STATUS_STYLES[source.status]}`}>
                      {source.status}
                    </span>
                    <p className="mt-1 max-w-[180px] text-xs text-slate-400">{source.statusReason}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {source.coverage}
                    {source.coverageDetail ? ` (${source.coverageDetail})` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{formatDateTime(source.lastRunAt)}</td>
                  <td className="px-4 py-3 text-slate-300">{source.eventsFetched}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {source.incidentsCreated} / {source.incidentsPersistedTotal}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[220px] truncate text-xs text-rose-300/90" title={source.lastError ?? undefined}>
                      {source.lastError ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{formatDateTime(source.nextRunEstimate)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => forceRefresh(source.sourceId)}
                      disabled={runningSource !== null || source.status === "DISABLED" || source.role === "context"}
                      className="rounded border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-white/[0.1] disabled:opacity-40"
                    >
                      {runningSource === source.sourceId ? "Ejecutando…" : "Forzar actualización"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500">
          El cron externo ejecuta Global Watch cada 15 minutos (.github/workflows/argus-global-watch.yml). Una alerta
          roja oficial debería aparecer en el mapa en menos de 5 minutos desde la corrida que la detecta.
        </p>
      </div>
    </main>
  );
}
