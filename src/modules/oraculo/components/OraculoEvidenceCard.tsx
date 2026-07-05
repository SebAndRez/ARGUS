import type { OraculoEvidence } from "@/modules/oraculo/types";
import {
  formatOraculoRelativeTime,
  oraculoConfidenceLabel,
  oraculoConfidenceTone,
  oraculoVerificationLabel,
} from "@/modules/oraculo/utils";

interface Props {
  evidence: OraculoEvidence;
  score?: number;
  onSelect?: (evidence: OraculoEvidence) => void;
}

export default function OraculoEvidenceCard({ evidence, score, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(evidence)}
      className="w-full border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-violet-300/25 hover:bg-violet-400/5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{evidence.title}</p>
        <span className={`shrink-0 border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${oraculoConfidenceTone[evidence.confidence]}`}>
          {oraculoConfidenceLabel[evidence.confidence]}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {evidence.sourceName} · {evidence.category.replace(/_/g, " ")}
      </p>
      <p className="mt-1 text-[0.65rem] text-slate-500">
        Score {score ?? evidence.reliabilityScore}/100 · {oraculoVerificationLabel[evidence.verificationStatus]} ·{" "}
        {formatOraculoRelativeTime(evidence.collectedAt)}
      </p>
      {evidence.location?.label && (
        <p className="mt-1 text-[0.62rem] text-slate-600">
          {evidence.location.label}
          {evidence.location.isApproximate ? " (aprox.)" : ""}
        </p>
      )}
      {evidence.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {evidence.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="border border-white/10 px-1.5 py-0.5 text-[0.55rem] uppercase text-slate-500">
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
