"use client";

import { useArgusEventAnalysis } from "@/hooks/useArgusEventAnalysis";
import ArgusIntelligenceAnalysisCard from "@/components/risk/ArgusIntelligenceAnalysisCard";
import RiskEvidenceList from "@/components/risk/RiskEvidenceList";
import {
  calculateArgusConfidenceFromEvidence,
  getConfirmationBadges,
} from "@/lib/prediction/confirmationScoring";

type ArgusEventAnalysisBlockProps = {
  eventId?: string;
  externalEventId?: string;
  reportId?: string;
  sourceId?: string;
  externalId?: string;
  eventKind?: string;
  title?: string;
  compact?: boolean;
};

const statusLabel: Record<string, string> = {
  watch: "vigilancia",
  possible: "posible",
  probable: "probable",
  confirmed: "confirmado por fuente oficial",
  reduced: "reducido",
  dismissed: "descartado",
  insufficient_data: "sin datos suficientes",
};

const probabilityLabel: Record<string, string> = {
  very_low: "muy baja",
  low: "baja",
  medium: "media",
  high: "alta",
  critical: "critica",
};

function isCitizenEvent(kind?: string) {
  return ["citizen_report", "report", "REPORT", "SOS"].includes(kind ?? "");
}

function isOfficialSource(sourceId?: string) {
  return Boolean(sourceId && sourceId !== "citizen_report");
}

function fallbackCopy(input: ArgusEventAnalysisBlockProps) {
  if (isCitizenEvent(input.eventKind)) {
    return {
      title: "Verificacion ARGUS",
      badge: "En verificacion",
      body:
        "Reporte ciudadano en verificacion. ARGUS recomienda contrastar con fuentes oficiales, camaras cercanas o reportes adicionales antes de elevar prioridad.",
      action:
        "Contrastar con fuentes oficiales, fuentes visuales o nuevos reportes cercanos.",
      className: "border-cyan-300/20 bg-cyan-400/8 text-cyan-100",
    };
  }

  if (isOfficialSource(input.sourceId)) {
    return {
      title: "Fuente oficial detectada",
      badge: "Evidencia primaria",
      body:
        "ARGUS usara esta fuente como evidencia primaria. El contexto historico puede apoyar la lectura, pero no reemplaza esta fuente ni confirma por si solo un evento actual.",
      action: "Mantener seguimiento de actualizaciones oficiales y correlaciones.",
      className: "border-emerald-300/20 bg-emerald-400/8 text-emerald-100",
    };
  }

  return {
    title: "Sin hipotesis ARGUS activa",
    badge: "Sin datos suficientes",
    body:
      "ARGUS aun no tiene una hipotesis activa para este evento. Se mostrara analisis cuando existan fuentes suficientes o correlaciones relevantes.",
    action: "Esperar nueva evidencia o seleccionar una fuente relacionada.",
    className: "border-white/10 bg-slate-900/55 text-slate-200",
  };
}

export default function ArgusEventAnalysisBlock({
  compact = false,
  ...props
}: ArgusEventAnalysisBlockProps) {
  const { loading, error, primaryAssessment, predictiveAnalysis, emptyReason } =
    useArgusEventAnalysis(props);
  const fallback = fallbackCopy(props);

  if (!loading && !error && predictiveAnalysis) {
    return <ArgusIntelligenceAnalysisCard analysis={predictiveAnalysis} compact={compact} />;
  }

  return (
    <section
      className={`argus-analysis-block rounded-lg border border-cyan-300/20 bg-slate-950/70 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="argus-analysis-header flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-cyan-300/85">
            ANÁLISIS INTELIGENCIA ARGUS
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {props.title ?? primaryAssessment?.title ?? fallback.title}
          </p>
        </div>
        <span className="argus-analysis-badge rounded-md border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[0.58rem] font-bold uppercase text-cyan-100">
          Hipotesis
        </span>
      </div>

      {loading && (
        <p className="mt-3 text-sm leading-6 text-slate-300">
          ARGUS esta revisando evidencia disponible...
        </p>
      )}

      {error && !loading && (
        <div className="argus-analysis-empty mt-3 rounded-md border border-amber-300/20 bg-amber-400/8 p-3 text-sm leading-6 text-amber-100">
          {error}
        </div>
      )}

      {!loading && !error && primaryAssessment && (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap gap-1.5">
            {getConfirmationBadges(primaryAssessment.evidence).map((badge) => (
              <span
                key={badge}
                className="rounded border border-cyan-300/15 bg-cyan-400/8 px-2 py-1 text-[0.55rem] font-bold uppercase text-cyan-100"
              >
                {badge}
              </span>
            ))}
            <span className="rounded border border-amber-300/20 bg-amber-400/8 px-2 py-1 text-[0.55rem] font-bold uppercase text-amber-100">
              Estimacion, no exacto
            </span>
          </div>
          <p className="text-sm leading-6 text-slate-200">
            <span className="font-semibold text-cyan-100">Hipotesis: </span>
            {primaryAssessment.summary}
          </p>
          <p className="rounded-md border border-amber-300/15 bg-amber-400/8 px-2.5 py-2 text-[0.62rem] leading-4 text-amber-100/85">
            Estimacion ARGUS: no es una prediccion exacta ni reemplaza informacion oficial.
          </p>
          <p className="text-[0.62rem] leading-4 text-slate-500">
            {calculateArgusConfidenceFromEvidence(primaryAssessment.evidence).explanation}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-white/10 bg-slate-900/70 p-2">
              <p className="text-[0.55rem] font-bold uppercase text-slate-500">Estado</p>
              <p className="mt-1 text-xs font-semibold text-slate-100">
                {statusLabel[primaryAssessment.status] ?? primaryAssessment.status}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-slate-900/70 p-2">
              <p className="text-[0.55rem] font-bold uppercase text-slate-500">Probabilidad</p>
              <p className="mt-1 text-xs font-semibold text-amber-100">
                {probabilityLabel[primaryAssessment.probabilityBand] ??
                  primaryAssessment.probabilityBand}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-slate-900/70 p-2">
              <p className="text-[0.55rem] font-bold uppercase text-slate-500">Confianza</p>
              <p className="mt-1 font-mono text-xs font-semibold text-cyan-100">
                {primaryAssessment.confidence}%
              </p>
            </div>
          </div>

          <div className="rounded-md border border-cyan-300/15 bg-cyan-400/8 p-3">
            <p className="text-[0.6rem] font-bold uppercase text-cyan-200">
              Accion recomendada
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-100">
              {primaryAssessment.recommendedAction}
            </p>
          </div>

          {primaryAssessment.evidence.length > 0 && (
            <div className="argus-analysis-evidence">
              <RiskEvidenceList evidence={primaryAssessment.evidence} />
            </div>
          )}

          {primaryAssessment.historicalContext && (
            <details className="argus-analysis-context rounded-md border border-white/10 bg-slate-900/55 p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase text-slate-300">
                Contexto historico y fuentes doctrinales
              </summary>
              <p className="mt-3 text-xs leading-5 text-slate-300">
                {primaryAssessment.historicalContext.explanation}
              </p>
              <p className="mt-2 text-[0.62rem] leading-5 text-slate-500">
                Este contexto no confirma el evento actual; solo entrega
                antecedentes historicos/doctrinales.
              </p>
              <div className="mt-3 grid gap-2">
                {primaryAssessment.historicalContext.facts.slice(0, 3).map((fact) => (
                  <a
                    key={fact.id}
                    href={fact.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded border border-white/8 bg-black/20 p-2 text-xs text-slate-300 hover:border-cyan-300/25 hover:text-white"
                  >
                    {fact.year ? `${fact.year} - ` : ""}
                    {fact.title}
                  </a>
                ))}
                {primaryAssessment.historicalContext.documents
                  .slice(0, 3)
                  .map((document) => (
                    <a
                      key={document.id}
                      href={document.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded border border-white/8 bg-black/20 p-2 text-xs text-slate-400 hover:border-cyan-300/25 hover:text-white"
                    >
                      {document.title}
                    </a>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}

      {!loading && !error && !primaryAssessment && (
        <div className={`argus-analysis-empty mt-3 rounded-md border p-3 ${fallback.className}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{fallback.title}</p>
            <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[0.58rem] font-bold uppercase">
              {fallback.badge}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6">{fallback.body}</p>
          <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-400/8 px-2.5 py-2 text-[0.62rem] leading-4 text-amber-100/85">
            Estimacion ARGUS: no es una prediccion exacta ni reemplaza informacion oficial.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {emptyReason ?? fallback.action}
          </p>
        </div>
      )}
    </section>
  );
}
