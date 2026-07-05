import type { TalosRiskAssessment } from "@/modules/talos/types";
import {
  formatTalosRelativeTime,
  talosConfidenceLabel,
  talosEscalationLabel,
  talosImpactLabel,
  talosRiskLevelLabel,
  talosRiskLevelTone,
} from "@/modules/talos/utils";

interface Props {
  assessment: TalosRiskAssessment;
  rank?: number;
  onSelect?: (assessment: TalosRiskAssessment) => void;
}

export default function TalosRiskCard({ assessment, rank, onSelect }: Props) {
  const topFactors = [...assessment.factors]
    .filter((factor) => factor.direction === "increases_risk" && factor.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(assessment)}
      className="w-full border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-fuchsia-300/25 hover:bg-fuchsia-400/5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {rank !== undefined && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-white/15 text-[0.6rem] font-bold text-slate-300">
              {rank}
            </span>
          )}
          <p className="text-sm font-semibold text-white">{assessment.title}</p>
        </div>
        <span className={`shrink-0 border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${talosRiskLevelTone[assessment.riskLevel]}`}>
          {talosRiskLevelLabel[assessment.riskLevel]}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {assessment.category.replace(/_/g, " ")} · Score {assessment.riskScore}/100 · Confianza {talosConfidenceLabel[assessment.confidence]}
      </p>
      <p className="mt-1 text-[0.65rem] text-slate-500">
        Impacto {talosImpactLabel[assessment.impact]} · Escalamiento {talosEscalationLabel[assessment.escalationLikelihood]} ·{" "}
        {formatTalosRelativeTime(assessment.generatedAt)}
      </p>
      {topFactors.length > 0 && (
        <p className="mt-1 text-[0.62rem] text-fuchsia-300/80">
          Factores principales: {topFactors.map((f) => f.label.toLowerCase()).join(", ")}
        </p>
      )}
      {assessment.recommendations.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {assessment.recommendations.slice(0, 4).map((rec) => (
            <span key={rec.moduleId} className="border border-white/10 px-1.5 py-0.5 text-[0.55rem] uppercase text-slate-400">
              {rec.moduleName.replace("ARGUS ", "")}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
