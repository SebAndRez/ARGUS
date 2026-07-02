import SourceReliabilityBadge from "@/components/dashboard/SourceReliabilityBadge";
import type { ArgusIncidentKnowledge, ArgusSourceReliabilityScore } from "@/types/knowledgeIntake";

function pseudoScore(score: number): ArgusSourceReliabilityScore {
  const label =
    score >= 90
      ? "official_priority"
      : score >= 75
        ? "trusted_secondary"
        : score >= 60
          ? "needs_validation"
          : score >= 40
            ? "context_only"
            : "not_operational";
  return {
    authorityScore: score,
    freshnessScore: score,
    technicalDepthScore: score,
    historicalAccuracyScore: score,
    geospatialPrecisionScore: score,
    licenseClarityScore: score,
    updateCadenceScore: score,
    biasRiskScore: Math.max(0, 100 - score),
    finalScore: score,
    label,
  };
}

export default function IncidentKnowledgeCard({ incident }: { incident: ArgusIncidentKnowledge }) {
  const factors = Object.entries(incident.technicalFactors).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return (
    <article className="rounded-lg border border-white/10 bg-slate-950/70 p-4 shadow-lg shadow-black/25">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 font-semibold text-cyan-100">
              {incident.domain}
            </span>
            <span className="rounded border border-rose-300/20 bg-rose-400/10 px-2 py-1 font-semibold text-rose-100">
              {incident.severity}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-white">{incident.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{incident.summary}</p>
        </div>
        <SourceReliabilityBadge score={pseudoScore(incident.sourceReliabilityScore)} />
      </div>

      <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-2">
        <div>
          <span className="text-slate-500">Fuente</span>
          <p className="mt-1 font-semibold text-slate-100">{incident.sourceNames.join(", ")}</p>
        </div>
        <div>
          <span className="text-slate-500">Ubicacion</span>
          <p className="mt-1 font-semibold text-slate-100">
            {[incident.locality, incident.region, incident.country].filter(Boolean).join(", ") || "Sin ubicacion precisa"}
          </p>
        </div>
        <div>
          <span className="text-slate-500">Fecha</span>
          <p className="mt-1 font-semibold text-slate-100">{incident.occurredAt ?? "Fecha incierta"}</p>
        </div>
        <div>
          <span className="text-slate-500">Confianza</span>
          <p className="mt-1 font-semibold text-slate-100">{incident.confidenceScore}% con {incident.evidenceCount} evidencia(s)</p>
        </div>
      </div>

      {factors.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {factors.slice(0, 7).map(([key, value]) => (
            <span key={key} className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-200">
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold text-cyan-100">Leccion aprendida</p>
          <p className="mt-2 text-xs leading-5 text-slate-300">{incident.lessonsLearned[0]?.summary ?? "Pendiente de extraccion."}</p>
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold text-amber-100">Accion recomendada</p>
          <p className="mt-2 text-xs leading-5 text-slate-300">{incident.recommendedActions[0]?.text ?? "Pendiente de revision humana."}</p>
        </div>
      </div>
    </article>
  );
}
