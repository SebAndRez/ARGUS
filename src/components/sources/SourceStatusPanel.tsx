import IngestStatusCard from "@/components/sources/IngestStatusCard";
import { buildSourceHealthSummary } from "@/lib/sources/sourceHealthEngine";

export default function SourceStatusPanel() {
  const summary = buildSourceHealthSummary();
  const visibleSources = summary.sources
    .filter((source) => source.status !== "NEEDS_REVIEW")
    .slice(0, 8);

  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/86 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-cyan-300/70">
            Source Operations
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">Ingesta y salud</h3>
        </div>
        <a
          href="/api/sources/status"
          className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300"
        >
          Ver detalles
        </a>
      </header>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded border border-white/10 bg-white/[0.03] p-2">
          <p className="text-lg font-semibold text-emerald-100">{summary.active}</p>
          <p className="text-slate-500">Activas</p>
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] p-2">
          <p className="text-lg font-semibold text-violet-100">{summary.demo}</p>
          <p className="text-slate-500">Demo</p>
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] p-2">
          <p className="text-lg font-semibold text-orange-100">{summary.needsKey}</p>
          <p className="text-slate-500">Keys</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {visibleSources.map((source) => (
          <IngestStatusCard key={source.id} source={source} />
        ))}
      </div>
    </section>
  );
}
