import type { VigiaReputationSummary } from "@/modules/vigia/types";

const standingLabel: Record<VigiaReputationSummary["standing"], string> = {
  trusted: "Confiable",
  normal: "Normal",
  observed: "En observación",
  limited: "Limitado",
  blocked: "Bloqueado",
};

const standingTone: Record<VigiaReputationSummary["standing"], string> = {
  trusted: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  normal: "border-cyan-300/25 bg-cyan-400/8 text-cyan-100",
  observed: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  limited: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  blocked: "border-red-400/40 bg-red-500/12 text-red-100",
};

interface Props {
  summary: VigiaReputationSummary;
}

export default function VigiaReputationPanel({ summary }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Tu reputación</h2>
      <div className={`mt-2 inline-flex border px-2.5 py-1 text-xs font-bold uppercase ${standingTone[summary.standing]}`}>
        {standingLabel[summary.standing]}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Score</dt>
          <dd className="font-semibold text-white">{summary.score}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Reportes enviados</dt>
          <dd className="font-semibold text-white">{summary.reportsSubmitted}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Confirmados</dt>
          <dd className="font-semibold text-emerald-200">{summary.reportsConfirmed}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Strikes</dt>
          <dd className="font-semibold text-amber-200">{summary.strikes}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[0.62rem] text-slate-500">
        {summary.canCreateNormalReports
          ? "Puedes crear reportes normales."
          : "No puedes crear reportes normales por el momento."}
      </p>
      <p className="text-[0.62rem] text-emerald-300/80">SOS siempre disponible, sin excepción.</p>
    </section>
  );
}
