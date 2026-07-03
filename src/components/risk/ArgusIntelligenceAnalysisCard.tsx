"use client";

import type { ArgusPredictionResult } from "@/types/predictiveCore";

type Props = {
  analysis: ArgusPredictionResult;
  compact?: boolean;
  locale?: "es" | "en";
};

const statusLabel: Record<ArgusPredictionResult["status"], string> = {
  watch: "en vigilancia",
  verifying: "en verificación",
  possible: "posible",
  probable: "probable",
  confirmed_by_official_source: "confirmado por fuente oficial",
  reduced: "reducido",
  dismissed: "descartado",
  insufficient_data: "requiere confirmación",
};

const modeLabel: Record<ArgusPredictionResult["primaryMode"], string> = {
  official: "fuente oficial",
  citizen: "reporte ciudadano",
  hybrid: "híbrido",
  system: "estimación ARGUS",
};

const severityClass: Record<ArgusPredictionResult["severity"], string> = {
  P0: "border-red-300/35 bg-red-500/12 text-red-100",
  P1: "border-orange-300/35 bg-orange-500/12 text-orange-100",
  P2: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  P3: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  P4: "border-sky-300/25 bg-sky-400/10 text-sky-100",
};

export default function ArgusIntelligenceAnalysisCard({
  analysis,
  compact = false,
  locale = "es",
}: Props) {
  const title =
    locale === "en" ? "ARGUS INTELLIGENCE ANALYSIS" : "ANÁLISIS INTELIGENCIA ARGUS";

  return (
    <section
      className={`argus-analysis-block rounded-lg border border-cyan-300/20 bg-slate-950/75 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-cyan-300/85">
            {title}
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-white">
            {analysis.title}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-1 text-[0.58rem] font-bold uppercase ${severityClass[analysis.severity]}`}>
          {analysis.severity}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="rounded border border-cyan-300/15 bg-cyan-400/8 px-2 py-1 text-[0.55rem] font-bold uppercase text-cyan-100">
          {modeLabel[analysis.primaryMode]}
        </span>
        <span className="rounded border border-amber-300/20 bg-amber-400/8 px-2 py-1 text-[0.55rem] font-bold uppercase text-amber-100">
          estimación no exacta
        </span>
        <span className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-[0.55rem] font-bold uppercase text-slate-200">
          {statusLabel[analysis.status]}
        </span>
        {analysis.evidence.some((item) => item.level === "primary") && (
          <span className="rounded border border-emerald-300/20 bg-emerald-400/8 px-2 py-1 text-[0.55rem] font-bold uppercase text-emerald-100">
            evidencia primaria
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">
        <span className="font-semibold text-cyan-100">Hipótesis: </span>
        {analysis.hypothesis}
      </p>
      <p className="mt-3 rounded-md border border-amber-300/15 bg-amber-400/8 px-2.5 py-2 text-[0.62rem] leading-4 text-amber-100/85">
        Estimación ARGUS: no es una predicción exacta ni reemplaza información oficial.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Estado" value={statusLabel[analysis.status]} />
        <Metric label="Probabilidad" value={analysis.probabilityLabel} tone="text-amber-100" />
        <Metric label="Confianza" value={`${analysis.confidence}%`} tone="text-cyan-100" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Metric label="Incertidumbre" value={analysis.uncertainty} />
        <Metric label="Score" value={`${analysis.probabilityScore}/100`} tone="text-slate-100" />
      </div>

      <div className="mt-3 rounded-md border border-cyan-300/15 bg-cyan-400/8 p-3">
        <p className="text-[0.6rem] font-bold uppercase text-cyan-200">
          Acción recomendada
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-100">
          {analysis.recommendedAction}
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        {analysis.evidence.map((item) => (
          <div key={item.id} className="rounded-md border border-white/10 bg-slate-900/60 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white">{item.label}</p>
              <span className="font-mono text-[0.62rem] text-cyan-200">
                {Math.round(item.weight * 100)}%
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
          </div>
        ))}
      </div>

      {analysis.limitations.length > 0 && (
        <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-[0.6rem] font-bold uppercase text-slate-400">Limitaciones</p>
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-400">
            {analysis.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "text-slate-100",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-slate-900/70 p-2">
      <p className="text-[0.55rem] font-bold uppercase text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-xs font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
