import type { HermesBlockage } from "@/modules/hermes/types";
import { formatHermesRelativeTime, hermesConfidenceLabel } from "@/modules/hermes/utils";

const statusLabel: Record<HermesBlockage["status"], string> = {
  reported: "Reportado",
  confirmed: "Confirmado",
  cleared: "Despejado",
  disputed: "Disputado",
};

const statusTone: Record<HermesBlockage["status"], string> = {
  reported: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  confirmed: "border-red-400/40 bg-red-500/12 text-red-100",
  cleared: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  disputed: "border-orange-400/35 bg-orange-500/12 text-orange-100",
};

interface Props {
  blockages: HermesBlockage[];
}

export default function HermesBlockagePanel({ blockages }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Bloqueos</h2>
        <span className="text-[0.6rem] text-slate-500">{blockages.length} registrados</span>
      </header>
      <div className="space-y-2">
        {blockages.length === 0 && <p className="text-xs text-slate-500">Sin bloqueos registrados.</p>}
        {blockages.map((blockage) => (
          <div key={blockage.id} className="border border-white/10 bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">{blockage.type.replace(/_/g, " ")}</span>
              <span className={`border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${statusTone[blockage.status]}`}>
                {statusLabel[blockage.status]}
              </span>
            </div>
            <p className="mt-1 text-[0.65rem] text-slate-500">
              {blockage.location.label ?? `${blockage.location.lat.toFixed(3)}, ${blockage.location.lng.toFixed(3)}`}
            </p>
            <p className="mt-1 text-[0.62rem] text-slate-500">
              Fuente {blockage.sourceModule} · Confianza {hermesConfidenceLabel[blockage.confidence]} ·{" "}
              {formatHermesRelativeTime(blockage.updatedAt)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
