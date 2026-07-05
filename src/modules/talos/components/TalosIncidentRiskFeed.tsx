import type { TalosRiskAssessment } from "@/modules/talos/types";
import TalosRiskCard from "@/modules/talos/components/TalosRiskCard";

interface Props {
  assessments: TalosRiskAssessment[];
  onSelect?: (assessment: TalosRiskAssessment) => void;
}

export default function TalosIncidentRiskFeed({ assessments, onSelect }: Props) {
  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-fuchsia-300">
          Evaluaciones de riesgo
        </h2>
        <span className="text-[0.6rem] text-slate-500">{assessments.length} eventos evaluados</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {assessments.length === 0 && <p className="text-xs text-slate-500">Sin evaluaciones disponibles.</p>}
        {assessments.map((assessment) => (
          <TalosRiskCard key={assessment.id} assessment={assessment} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
