"use client";

import Link from "next/link";
import CanonicalIncidentPanel from "@/components/modules/CanonicalIncidentPanel";
import { useCanonicalModuleIncidentById } from "@/hooks/useCanonicalModuleIncidents";
import { buildOraculoCanonicalAnalysis } from "@/modules/oraculo/oraculoCanonicalAnalysis";

/**
 * ARGUS Prompt 17 §13 — ORÁCULO recibe `canonicalIncidentId` (vía selección
 * en este panel, o `?incidentId=` al llegar desde VIGÍA) y produce una
 * anotación de análisis explícitamente marcada como tal (`isPrediction`,
 * `isOfficial: false`) — nunca se presenta como alerta oficial ni hecho
 * confirmado.
 */

interface Props {
  selectedIncidentId: string | null;
  onSelect: (id: string) => void;
}

export default function OraculoCanonicalIncidentPanel({ selectedIncidentId, onSelect }: Props) {
  const result = useCanonicalModuleIncidentById("argus-oraculo", selectedIncidentId);
  const analysis = result && "data" in result ? buildOraculoCanonicalAnalysis(result.data) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CanonicalIncidentPanel
        moduleId="argus-oraculo"
        title="Incidentes canónicos disponibles"
        selectedIncidentId={selectedIncidentId}
        onSelect={onSelect}
      />
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">Análisis ORÁCULO sobre incidente</h2>
        {!selectedIncidentId && <p className="mt-2 text-xs text-slate-500">Selecciona un incidente para analizarlo.</p>}
        {result?.state === "loading" && <p className="mt-2 text-xs text-slate-500">Cargando…</p>}
        {result?.state === "unauthorized" && <p className="mt-2 text-xs text-amber-300">No autorizado.</p>}
        {result && "error" in result && (result.state === "unavailable" || result.state === "insufficient_data") && (
          <p className="mt-2 text-xs text-rose-300">{result.error.message}</p>
        )}
        {analysis && (
          <div className="mt-2 grid gap-1.5 text-xs text-slate-300">
            <p className="rounded-none border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-violet-200">
              Análisis ARGUS — no es una alerta oficial
            </p>
            <p>{analysis.summary}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-slate-500">Confianza</dt>
              <dd>{analysis.confidence}/100</dd>
              <dt className="text-slate-500">Evidencia base</dt>
              <dd>{analysis.basedOnEvidenceCount} fuente(s)</dd>
              <dt className="text-slate-500">Generado</dt>
              <dd>{new Date(analysis.generatedAt).toLocaleString("es-CL")}</dd>
            </dl>
            <Link
              href={`/modules/vigia?incidentId=${encodeURIComponent(analysis.basedOnIncidentId)}`}
              className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wide text-cyan-300 hover:text-cyan-200"
            >
              Ver incidente base en VIGÍA →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
