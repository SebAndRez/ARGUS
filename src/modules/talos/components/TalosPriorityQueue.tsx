import type { TalosRiskAssessment } from "@/modules/talos/types";
import TalosRiskCard from "@/modules/talos/components/TalosRiskCard";

interface Props {
  assessments: TalosRiskAssessment[];
  onSelect?: (assessment: TalosRiskAssessment) => void;
}

/**
 * Cola de prioridad: mismos datos que el feed, pero ordenados por
 * `priorityRank` y numerados, para responder directamente "qué requiere
 * atención inmediata".
 */
export default function TalosPriorityQueue({ assessments, onSelect }: Props) {
  const sorted = [...assessments].sort((a, b) => b.priorityRank - a.priorityRank);

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-fuchsia-300">
          Cola de prioridad
        </h2>
        <span className="text-[0.6rem] text-slate-500">Ordenada por priorityRank</span>
      </header>
      <div className="space-y-2">
        {sorted.slice(0, 8).map((assessment, index) => (
          <TalosRiskCard key={assessment.id} assessment={assessment} rank={index + 1} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
