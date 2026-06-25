"use client";

import { useState } from "react";
import RiskEvidenceList from "@/components/risk/RiskEvidenceList";
import {
  calculateArgusConfidenceFromEvidence,
  getConfirmationBadges,
} from "@/lib/prediction/confirmationScoring";
import type { ArgusRiskAssessment } from "@/types/riskAssessment";

interface Props {
  assessment: ArgusRiskAssessment;
}

const statusLabel: Record<ArgusRiskAssessment["status"], string> = {
  watch: "WATCH",
  possible: "POSIBLE",
  probable: "PROBABLE",
  confirmed: "CONFIRMADO",
  reduced: "REDUCIDO",
  dismissed: "DESCARTADO",
  insufficient_data: "DATOS INSUFICIENTES",
};

const bandClass: Record<ArgusRiskAssessment["probabilityBand"], string> = {
  very_low: "border-slate-400/20 bg-slate-400/8 text-slate-300",
  low: "border-emerald-300/20 bg-emerald-400/8 text-emerald-200",
  medium: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  high: "border-orange-300/30 bg-orange-400/12 text-orange-100",
  critical: "border-red-300/35 bg-red-500/15 text-red-100",
};

export default function RiskAssessmentCard({ assessment }: Props) {
  const [showContext, setShowContext] = useState(false);
  const historical = assessment.historicalContext;
  const confirmation = calculateArgusConfidenceFromEvidence(assessment.evidence);
  const confirmationBadges = getConfirmationBadges(assessment.evidence);

  return (
    <article className="border border-cyan-300/15 bg-slate-950/75 p-3 shadow-lg shadow-black/25">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-cyan-300">
            Prediccion ARGUS
          </p>
          <h3 className="mt-1 break-words text-sm font-semibold text-white">
            {assessment.title}
          </h3>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 text-[0.55rem] font-bold ${bandClass[assessment.probabilityBand]}`}
        >
          {statusLabel[assessment.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {confirmationBadges.map((badge) => (
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

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Prob." value={`${assessment.probabilityScore}%`} />
        <Metric label="Conf." value={`${Math.max(assessment.confidence, confirmation.confidence)}%`} />
        <Metric label="Riesgo" value={assessment.riskType.replace(/_/g, " ")} />
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-300">{assessment.summary}</p>
      <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-400/8 px-2.5 py-2 text-[0.62rem] leading-4 text-amber-100/85">
        Estimacion ARGUS: no es una prediccion exacta ni reemplaza informacion oficial.
      </p>
      <p className="mt-2 text-[0.62rem] leading-4 text-slate-500">
        {confirmation.explanation}
      </p>

      <div className="mt-3 border border-cyan-300/15 bg-cyan-400/8 p-3">
        <p className="text-[0.58rem] font-bold uppercase text-cyan-200">
          Accion recomendada
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-100">
          {assessment.recommendedAction}
        </p>
      </div>

      <div className="mt-3">
        <RiskEvidenceList evidence={assessment.evidence} />
      </div>

      {historical && (
        <section className="mt-3 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setShowContext((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left text-[0.62rem] font-bold uppercase text-slate-300"
          >
            Contexto historico
            <span className="text-cyan-300">{showContext ? "Ocultar" : "Ver"}</span>
          </button>
          {showContext && (
            <div className="mt-3 grid gap-2">
              <p className="text-xs leading-5 text-slate-400">
                {historical.explanation}
              </p>
              {historical.facts.slice(0, 3).map((fact) => (
                <div key={fact.id} className="border border-white/8 bg-black/20 p-2">
                  <p className="text-xs font-semibold text-slate-100">{fact.title}</p>
                  <p className="mt-1 text-[0.6rem] text-slate-400">
                    {fact.year ? `${fact.year} · ` : ""}
                    {fact.magnitudeLabel ?? ""}
                    {fact.maxSeaLevelVariationM
                      ? ` · variacion ${fact.maxSeaLevelVariationM} m`
                      : ""}
                  </p>
                </div>
              ))}
              {historical.documents.length > 0 && (
                <div className="border border-white/8 bg-black/20 p-2">
                  <p className="text-[0.58rem] font-bold uppercase text-slate-500">
                    Fuentes doctrinales relacionadas
                  </p>
                  <div className="mt-2 grid gap-1.5">
                    {historical.documents.slice(0, 3).map((document) => (
                      <a
                        key={document.id}
                        href={document.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-cyan-200 hover:text-cyan-100"
                      >
                        {document.title} · prioridad {document.priority ?? "N/D"} ·{" "}
                        {document.ingestionStatus ?? "queued"}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-white/8 bg-slate-900/60 p-2">
      <p className="text-[0.54rem] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[0.68rem] font-bold text-slate-200">
        {value}
      </p>
    </div>
  );
}
