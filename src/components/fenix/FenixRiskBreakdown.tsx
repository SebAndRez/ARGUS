import type { FenixSimulationResult } from "@/types/fenixSimulation";

export default function FenixRiskBreakdown({ result }: { result: FenixSimulationResult }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
      <h3 className="text-sm font-semibold uppercase text-white">Riesgos previstos</h3>
      <div className="mt-3 grid gap-2">
        {(result.riskBreakdown ?? []).map((risk) => (
          <div key={String(risk.id)} className="rounded border border-white/10 bg-slate-900/70 p-3">
            <div className="flex justify-between gap-3">
              <p className="font-semibold text-white">{String(risk.label)}</p>
              <span className="text-xs font-bold uppercase text-amber-200">{String(risk.level)}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">{String(risk.detail)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

