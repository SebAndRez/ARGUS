import type { OraculoContradiction } from "@/modules/oraculo/types";

const severityTone: Record<OraculoContradiction["severity"], string> = {
  high: "border-red-400/40 bg-red-500/12 text-red-100",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  low: "border-white/15 bg-white/[0.03] text-slate-300",
};

const typeLabel: Record<OraculoContradiction["type"], string> = {
  severity_mismatch: "Discrepancia de severidad",
  location_mismatch: "Ubicaciones incompatibles",
  time_mismatch: "Tiempos incompatibles",
  status_mismatch: "Confirmado vs. descartado",
  source_conflict: "Conflicto de fuente",
  duplicate_conflict: "Posible duplicado",
};

interface Props {
  contradictions: OraculoContradiction[];
}

export default function OraculoContradictionPanel({ contradictions }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">Contradicciones</h2>
        <span className="text-[0.6rem] text-slate-500">{contradictions.length} detectadas</span>
      </header>

      {contradictions.length === 0 ? (
        <p className="text-xs text-slate-500">Sin contradicciones relevantes detectadas.</p>
      ) : (
        <ul className="space-y-2">
          {contradictions.map((contradiction) => (
            <li key={contradiction.id} className={`border p-2.5 ${severityTone[contradiction.severity]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.08em]">{typeLabel[contradiction.type]}</span>
                <span className="text-[0.55rem] font-bold uppercase opacity-80">{contradiction.severity}</span>
              </div>
              <p className="mt-1 text-xs">{contradiction.summary}</p>
              <p className="mt-1 text-[0.65rem] opacity-80">→ {contradiction.recommendation}</p>
              {contradiction.requiresHumanReview && (
                <p className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.06em] opacity-90">
                  Requiere revisión humana
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
