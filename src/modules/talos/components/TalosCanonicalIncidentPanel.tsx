"use client";

import Link from "next/link";
import CanonicalIncidentPanel from "@/components/modules/CanonicalIncidentPanel";
import { useCanonicalModuleIncidentById } from "@/hooks/useCanonicalModuleIncidents";
import { buildTalosCanonicalAssessmentView } from "@/modules/talos/talosCanonicalIncidentAdapter";

/**
 * ARGUS Prompt 17 §14 — TALOS recibe `canonicalIncidentId` y separa dato
 * observado (severidad/lifecycle/geometría del incidente canónico) de
 * estimación (`TalosRiskAssessment`, motor ya existente sin cambios) y
 * supuestos explícitos. Nunca convierte ausencia de datos en "impacto
 * cero" — el estado `insufficient_data` se muestra explícitamente.
 */

interface Props {
  selectedIncidentId: string | null;
  onSelect: (id: string) => void;
}

export default function TalosCanonicalIncidentPanel({ selectedIncidentId, onSelect }: Props) {
  const result = useCanonicalModuleIncidentById("argus-talos", selectedIncidentId);
  const view = result && "data" in result ? buildTalosCanonicalAssessmentView(result.data) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CanonicalIncidentPanel
        moduleId="argus-talos"
        title="Incidentes canónicos disponibles"
        selectedIncidentId={selectedIncidentId}
        onSelect={onSelect}
      />
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-fuchsia-300">Evaluación TALOS sobre incidente</h2>
        {!selectedIncidentId && <p className="mt-2 text-xs text-slate-500">Selecciona un incidente para evaluar impacto.</p>}
        {result?.state === "loading" && <p className="mt-2 text-xs text-slate-500">Cargando…</p>}
        {result?.state === "unauthorized" && <p className="mt-2 text-xs text-amber-300">No autorizado.</p>}
        {result && "error" in result && (result.state === "unavailable" || result.state === "insufficient_data") && (
          <p className="mt-2 text-xs text-rose-300">{result.error.message}</p>
        )}

        {view?.status === "insufficient_data" && (
          <p className="mt-2 text-xs text-slate-400">Datos insuficientes para estimar impacto (sin geometría puntual).</p>
        )}

        {view?.status === "available" && view.assessment && (
          <div className="mt-2 grid gap-1.5 text-xs text-slate-300">
            <p className="rounded-none border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-fuchsia-200">
              Estimación operacional — no es daño confirmado
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-slate-500">Nivel de riesgo</dt>
              <dd className="uppercase">{view.assessment.riskLevel}</dd>
              <dt className="text-slate-500">Impacto estimado</dt>
              <dd className="uppercase">{view.assessment.impact}</dd>
              <dt className="text-slate-500">Confianza</dt>
              <dd className="uppercase">{view.confidence}</dd>
              <dt className="text-slate-500">Generado</dt>
              <dd>{new Date(view.generatedAt).toLocaleString("es-CL")}</dd>
            </dl>
            <p className="mt-1 text-slate-400">{view.assessment.explanation}</p>
            <ul className="mt-1 list-disc pl-4 text-[0.65rem] text-slate-500">
              {view.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
            <Link
              href={`/modules/vigia?incidentId=${encodeURIComponent(view.incidentId)}`}
              className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wide text-cyan-300 hover:text-cyan-200"
            >
              Ver evidencia en VIGÍA →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
