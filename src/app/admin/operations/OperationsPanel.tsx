"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationalHealthSnapshot } from "@/types/operationalHealth";
import type { OperationalHealthStatus } from "@/lib/observability/healthStatus";

/**
 * ARGUS Prompt 19 §28-32 — panel de operador consolidado. Solo lee
 * `/api/operations/health` (snapshot ya calculado server-side) — nunca
 * ejecuta adaptadores, jobs ni health checks costosos desde el cliente.
 * Polling cada 45s (dentro del rango 30-60s sugerido), con `AbortController`
 * por solicitud, limpieza al desmontar y pausa cuando la pestaña está
 * oculta.
 */

type PanelState = "loading" | "loaded" | "unauthorized" | "unavailable";

const POLL_INTERVAL_MS = 45_000;

const STATUS_LABEL: Record<OperationalHealthStatus, string> = {
  healthy: "OPERATIVO",
  degraded: "PARCIAL",
  unavailable: "NO DISPONIBLE",
  misconfigured: "MAL CONFIGURADO",
  disabled: "DESACTIVADO",
  unknown: "DESCONOCIDO",
};

const STATUS_STYLE: Record<OperationalHealthStatus, string> = {
  healthy: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
  degraded: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  unavailable: "border-rose-300/30 bg-rose-400/10 text-rose-200",
  misconfigured: "border-rose-300/30 bg-rose-400/10 text-rose-200",
  disabled: "border-slate-300/20 bg-slate-400/10 text-slate-300",
  unknown: "border-slate-300/20 bg-slate-400/10 text-slate-400",
};

function StatusBadge({ status }: { status: OperationalHealthStatus }) {
  return (
    <span className={`inline-flex items-center border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

export default function OperationsPanel() {
  const [panelState, setPanelState] = useState<PanelState>("loading");
  const [snapshot, setSnapshot] = useState<OperationalHealthSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/operations/health", { cache: "no-store", signal: controller.signal });
      if (response.status === 401 || response.status === 403) {
        setPanelState("unauthorized");
        return;
      }
      if (!response.ok) {
        setPanelState("unavailable");
        setErrorMessage("El endpoint de salud operacional respondió con error.");
        return;
      }
      const payload = (await response.json()) as OperationalHealthSnapshot;
      setSnapshot(payload);
      setErrorMessage(null);
      setPanelState("loaded");
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setPanelState("unavailable");
      setErrorMessage(loadError instanceof Error ? loadError.message : "No fue posible cargar el estado operacional.");
    }
  }, []);

  useEffect(() => {
    load();
    let interval: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (interval) return;
      interval = setInterval(load, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        stopPolling();
      } else {
        load();
        startPolling();
      }
    }

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      abortRef.current?.abort();
    };
  }, [load]);

  if (panelState === "unauthorized") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <section className="max-w-lg border border-white/10 bg-slate-900 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Acceso no disponible</p>
          <h1 className="mt-2 text-xl font-bold">ARGUS Operations</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">La sesión ya no está autorizada para este panel.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white xl:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">ARGUS Operations</h1>
            <p className="text-sm text-slate-400">
              Estado operacional consolidado. Actualizado: {formatDateTime(snapshot?.generatedAt ?? null)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {panelState === "loading" && !snapshot && (
              <span className="border border-slate-300/20 bg-slate-400/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase text-slate-400">
                Cargando…
              </span>
            )}
            {snapshot && <StatusBadge status={snapshot.overallStatus} />}
            <a href="/admin/source-health" className="border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white">
              Ver fuentes en detalle
            </a>
          </div>
        </div>

        {panelState === "unavailable" && (
          <div className="border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage ?? "El estado operacional no está disponible en este momento."}
          </div>
        )}

        {snapshot && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Plataforma", health: snapshot.platform },
                { label: "Persistencia", health: snapshot.persistence },
                { label: "Backend distribuido", health: snapshot.distributedBackend },
                { label: "Fuentes", health: snapshot.sources },
              ].map((item) => (
                <div key={item.label} className="border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p>
                  <div className="mt-2">
                    <StatusBadge status={item.health.status} />
                  </div>
                  {item.health.detail && <p className="mt-2 text-xs text-slate-500">{item.health.detail}</p>}
                </div>
              ))}
            </section>

            <section className="overflow-x-auto border border-white/10 bg-white/[0.02]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Pipeline</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Último éxito</th>
                    <th className="px-4 py-3">Ventana de frescura</th>
                    <th className="px-4 py-3">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.pipelines.map((pipeline) => (
                    <tr key={pipeline.pipeline} className="border-b border-white/5">
                      <td className="px-4 py-3 font-semibold text-white">{pipeline.pipeline}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={pipeline.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-300">{formatDateTime(pipeline.lastSuccessAt)}</td>
                      <td className="px-4 py-3 text-slate-300">{pipeline.freshnessWindowMinutes} min</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{pipeline.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Notificaciones", health: snapshot.notifications },
                { label: "Proyección de mapa", health: snapshot.projections },
                { label: "Módulos", health: snapshot.modules },
              ].map((item) => (
                <div key={item.label} className="border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p>
                  <div className="mt-2">
                    <StatusBadge status={item.health.status} />
                  </div>
                  {item.health.detail && <p className="mt-2 text-xs text-slate-500">{item.health.detail}</p>}
                </div>
              ))}
            </section>

            <section className="border border-white/10 bg-white/[0.02] p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Problemas activos ({snapshot.activeIssues.length})
              </h2>
              {snapshot.activeIssues.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Sin problemas activos observados por este proceso en la última hora.</p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {snapshot.activeIssues.map((issue) => (
                    <div key={issue.code} className="grid gap-1 border border-white/10 bg-white/[0.02] p-3 text-xs sm:grid-cols-5 sm:items-center">
                      <span className="font-bold uppercase text-rose-300">{issue.severity}</span>
                      <span className="text-slate-300">{issue.component}</span>
                      <span className="text-slate-300 sm:col-span-2">{issue.summary}</span>
                      <span className="text-slate-500">{formatDateTime(issue.lastObservedAt)}</span>
                      {issue.runbookId && (
                        <a
                          href={`/docs/operations/ARGUS_OPERATIONS_RUNBOOK.md#${issue.runbookId}`}
                          className="text-cyan-300 underline sm:col-span-5"
                        >
                          Runbook: {issue.runbookId}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <p className="text-xs text-slate-500">
          Notificaciones/proyección/módulos muestran &quot;operativo&quot; cuando este proceso no observó fallos en la
          última hora (buffer en memoria, no histórico) — es ausencia de problema conocido, no una verificación
          activa. Ver docs/operations/ARGUS_OBSERVABILITY_BASELINE.md.
        </p>
      </div>
    </main>
  );
}
