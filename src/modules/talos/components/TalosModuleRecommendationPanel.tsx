import type { TalosModuleRecommendation } from "@/modules/talos/types";

const priorityTone: Record<TalosModuleRecommendation["priority"], string> = {
  critical: "border-red-400/40 bg-red-500/12 text-red-100",
  high: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  low: "border-white/15 bg-white/[0.03] text-slate-300",
};

interface Props {
  recommendations: TalosModuleRecommendation[];
}

export default function TalosModuleRecommendationPanel({ recommendations }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-fuchsia-300">
        Módulos recomendados
      </h2>
      {recommendations.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Sin recomendaciones para esta evaluación.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {recommendations.map((rec) => (
            <li key={rec.moduleId} className={`border p-2.5 ${priorityTone[rec.priority]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase">{rec.moduleName}</span>
                <span className="text-[0.55rem] font-bold uppercase opacity-80">{rec.priority}</span>
              </div>
              <p className="mt-1 text-[0.65rem] opacity-90">{rec.reason}</p>
              {rec.requiresRole && (
                <p className="mt-1 text-[0.58rem] uppercase opacity-70">
                  Requiere rol: {rec.requiresRole.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
