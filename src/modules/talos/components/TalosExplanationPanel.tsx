import type { TalosRiskAssessment } from "@/modules/talos/types";
import { talosConfidenceLabel } from "@/modules/talos/utils";

interface Props {
  assessment: TalosRiskAssessment | null;
}

export default function TalosExplanationPanel({ assessment }: Props) {
  if (!assessment) {
    return (
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-fuchsia-300">Explicación</h2>
        <p className="mt-2 text-xs text-slate-500">Selecciona una evaluación para ver su explicación completa.</p>
      </section>
    );
  }

  const increasing = assessment.factors.filter((f) => f.direction === "increases_risk" && f.contribution > 0);
  const reducing = assessment.factors.filter((f) => f.direction === "reduces_risk" && f.contribution < 0);

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-fuchsia-300">Explicación</h2>
      <p className="mt-2 text-sm font-semibold text-white">{assessment.title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-300">{assessment.explanation}</p>

      {increasing.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-orange-300">Factores que aumentan el riesgo</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
            {increasing.map((factor) => (
              <li key={factor.id}>· {factor.explanation}</li>
            ))}
          </ul>
        </div>
      )}

      {reducing.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-emerald-300">Factores que reducen el riesgo</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
            {reducing.map((factor) => (
              <li key={factor.id}>· {factor.explanation}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 border border-white/10 bg-white/[0.02] p-2.5 text-xs text-slate-300">
        <p>
          Confianza del análisis: <strong className="text-white">{talosConfidenceLabel[assessment.confidence]}</strong>
        </p>
        <p className="mt-1">
          Fuentes: {assessment.sourceSummary.vigiaReports} reporte(s) VIGÍA · {assessment.sourceSummary.officialSources} fuente(s)
          oficial(es) · {assessment.sourceSummary.citizenSources} fuente(s) ciudadana(s)
        </p>
        {assessment.sourceSummary.contradictionCount > 0 && (
          <p className="mt-1 text-amber-200">
            {assessment.sourceSummary.contradictionCount} contradicción(es) detectada(s): reduce la confianza, no oculta el riesgo.
          </p>
        )}
      </div>
    </section>
  );
}
