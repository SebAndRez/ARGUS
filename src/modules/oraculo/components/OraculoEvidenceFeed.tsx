import type { OraculoEvidence, OraculoScoringResult } from "@/modules/oraculo/types";
import OraculoEvidenceCard from "@/modules/oraculo/components/OraculoEvidenceCard";

interface Props {
  evidenceList: OraculoEvidence[];
  scores?: Record<string, OraculoScoringResult>;
  onSelect?: (evidence: OraculoEvidence) => void;
}

export default function OraculoEvidenceFeed({ evidenceList, scores, onSelect }: Props) {
  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">
          Feed de evidencia
        </h2>
        <span className="text-[0.6rem] text-slate-500">{evidenceList.length} evidencias</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {evidenceList.length === 0 && <p className="text-xs text-slate-500">Sin evidencia recolectada.</p>}
        {evidenceList.map((evidence) => (
          <OraculoEvidenceCard
            key={evidence.id}
            evidence={evidence}
            score={scores?.[evidence.id]?.score}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
