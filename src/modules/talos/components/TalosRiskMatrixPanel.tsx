import type { TalosRiskAssessment, TalosRiskLevel } from "@/modules/talos/types";
import { talosRiskLevelLabel, talosRiskLevelTone } from "@/modules/talos/utils";

interface Props {
  assessments: TalosRiskAssessment[];
}

const levels: TalosRiskLevel[] = ["minimal", "low", "medium", "high", "critical"];

export default function TalosRiskMatrixPanel({ assessments }: Props) {
  const counts = levels.map((level) => ({
    level,
    count: assessments.filter((a) => a.riskLevel === level).length,
  }));
  const maxCount = Math.max(1, ...counts.map((c) => c.count));

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-fuchsia-300">
        Matriz de riesgo
      </h2>
      <div className="mt-3 grid grid-cols-5 items-end gap-2">
        {counts.map(({ level, count }) => (
          <div key={level} className="flex flex-col items-center gap-1.5">
            <div
              className={`w-full border ${talosRiskLevelTone[level]}`}
              style={{ height: `${Math.max(8, (count / maxCount) * 64)}px` }}
            />
            <p className="text-xs font-bold text-white">{count}</p>
            <p className="text-center text-[0.58rem] uppercase text-slate-500">{talosRiskLevelLabel[level]}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.62rem] leading-4 text-slate-500">
        Combina impacto potencial, probabilidad de escalamiento y confianza del análisis. La falta de evidencia
        reduce la confianza mostrada por evento, no oculta el riesgo cuando el impacto/escalamiento es alto.
      </p>
    </section>
  );
}
