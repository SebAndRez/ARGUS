import type { AtlasRiskSummary } from "@/modules/atlas/types";
import { atlasSeverityLabel, atlasSeverityTone } from "@/modules/atlas/utils";

interface Props {
  risk: AtlasRiskSummary;
}

export default function AtlasRiskPanel({ risk }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
        Riesgo operacional
      </h2>
      <div className={`mt-2 inline-flex border px-2.5 py-1 text-xs font-bold uppercase ${atlasSeverityTone[risk.globalRisk]}`}>
        Riesgo global: {atlasSeverityLabel[risk.globalRisk]}
      </div>
      <p className="mt-2 text-xs text-slate-400">{risk.criticalEventCount} evento(s) críticos activos</p>
      {risk.topRiskZones.length > 0 && (
        <ul className="mt-2 space-y-1 text-[0.68rem] text-slate-400">
          {risk.topRiskZones.map((zone) => (
            <li key={zone}>· {zone}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[0.65rem] leading-4 text-slate-500">{risk.explanation}</p>
    </section>
  );
}
