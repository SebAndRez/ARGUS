import type { ArgusSourceReliabilityScore } from "@/types/knowledgeIntake";

const badgeStyle: Record<ArgusSourceReliabilityScore["label"], string> = {
  official_priority: "border-emerald-300/30 bg-emerald-400/12 text-emerald-100",
  trusted_secondary: "border-cyan-300/30 bg-cyan-400/12 text-cyan-100",
  needs_validation: "border-amber-300/30 bg-amber-400/12 text-amber-100",
  context_only: "border-slate-300/20 bg-slate-400/10 text-slate-200",
  not_operational: "border-rose-300/30 bg-rose-400/12 text-rose-100",
};

const labelText: Record<ArgusSourceReliabilityScore["label"], string> = {
  official_priority: "Official / High Trust",
  trusted_secondary: "Trusted",
  needs_validation: "Needs Validation",
  context_only: "Context Only",
  not_operational: "Not Operational",
};

export default function SourceReliabilityBadge({ score }: { score: ArgusSourceReliabilityScore }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 text-xs font-semibold ${badgeStyle[score.label]}`}>
      <span>{score.finalScore}</span>
      <span>{labelText[score.label]}</span>
    </span>
  );
}
