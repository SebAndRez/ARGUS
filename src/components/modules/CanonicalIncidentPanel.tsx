"use client";

import { useCanonicalModuleIncidents } from "@/hooks/useCanonicalModuleIncidents";
import type { CanonicalSeverity, ModuleIncidentFilters, ModuleVerificationStatus, OperationalContextModuleId } from "@/types/moduleOperationalContext";

/**
 * ARGUS Prompt 17 §7, §11-§14, §20-§21 — panel compartido de incidentes
 * canónicos. Los cuatro módulos lo embeben en vez de reimplementar su
 * propia interpretación de severidad/lifecycle/verificación; cada uno
 * decide su propio encabezado y layout alrededor de este panel (no
 * rediseña su dashboard, Prompt 17 §11/§37).
 *
 * Estados distinguidos explícitamente (Prompt 17 §20): `loading` ≠
 * `empty` ≠ `degraded`/`unavailable` ≠ `unauthorized` — nunca se colapsan
 * en "sin incidentes", y nunca se sustituye un fallo por datos demo.
 */

const SEVERITY_LABEL: Record<CanonicalSeverity, string> = {
  info: "Informativo",
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  critical: "Crítico",
};

const SEVERITY_TONE: Record<CanonicalSeverity, string> = {
  info: "border-slate-500/40 text-slate-300",
  low: "border-emerald-400/40 text-emerald-300",
  medium: "border-amber-400/40 text-amber-300",
  high: "border-orange-400/40 text-orange-300",
  critical: "border-rose-400/50 text-rose-300",
};

const VERIFICATION_LABEL: Record<ModuleVerificationStatus, string> = {
  unverified: "Sin verificar",
  candidate: "Candidato",
  corroborated: "Corroborado",
  official: "Oficial",
  rejected: "Rechazado",
};

export type CanonicalIncidentPanelProps = {
  moduleId: OperationalContextModuleId;
  title: string;
  filters?: ModuleIncidentFilters;
  selectedIncidentId?: string | null;
  onSelect?: (incidentId: string) => void;
};

export default function CanonicalIncidentPanel({ moduleId, title, filters, selectedIncidentId, onSelect }: CanonicalIncidentPanelProps) {
  const result = useCanonicalModuleIncidents(moduleId, filters ?? {});

  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">{title}</h2>
        {result.state === "available" || result.state === "empty" ? (
          <span className="text-[0.6rem] text-slate-500">{result.data.summaries.length} incidente(s)</span>
        ) : null}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {result.state === "loading" && <p className="text-xs text-slate-500">Cargando incidentes canónicos…</p>}

        {result.state === "unauthorized" && (
          <p className="text-xs text-amber-300">No autorizado para ver incidentes canónicos en este módulo.</p>
        )}

        {(result.state === "unavailable" || result.state === "degraded") && (
          <p className="text-xs text-rose-300">
            Fuente de incidentes no disponible en este momento{result.state === "degraded" ? " (datos parciales)" : ""}.
          </p>
        )}

        {result.state === "insufficient_data" && (
          <p className="text-xs text-slate-400">Datos insuficientes para mostrar este contenido.</p>
        )}

        {result.state === "empty" && <p className="text-xs text-slate-500">Sin incidentes activos por el momento.</p>}

        {(result.state === "available" || result.state === "degraded") &&
          "data" in result &&
          result.data.summaries.map((summary) => (
            <button
              key={summary.id}
              type="button"
              onClick={() => onSelect?.(summary.id)}
              className={`w-full border p-2.5 text-left transition hover:border-cyan-300/25 hover:bg-cyan-400/5 ${
                selectedIncidentId === summary.id ? "border-cyan-300/50 bg-cyan-400/10" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-white">
                  {summary.title}
                  {summary.isDemo ? <span className="ml-2 text-[0.55rem] font-normal uppercase text-amber-400">Demo</span> : null}
                </p>
                <span className={`shrink-0 border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${SEVERITY_TONE[summary.severity]}`}>
                  {SEVERITY_LABEL[summary.severity]}
                </span>
              </div>
              <p className="mt-1 text-[0.65rem] text-slate-500">
                {summary.type} · {summary.location.countryCode ?? "—"} · {VERIFICATION_LABEL[summary.verificationStatus]}
              </p>
              <p className="mt-1 text-[0.6rem] text-slate-600">
                {summary.sourceSummary.primarySource ?? "Fuente desconocida"} · {summary.sourceSummary.sourceCount} fuente(s) ·{" "}
                {summary.lifecycle}
              </p>
            </button>
          ))}
      </div>
    </section>
  );
}
