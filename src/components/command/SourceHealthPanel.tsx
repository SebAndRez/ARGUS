import type { CommandSourceHealth } from "@/types/incident";

export default function SourceHealthPanel({
  sources,
}: {
  sources: CommandSourceHealth[];
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/85 p-4">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-slate-500">
        Estado de fuentes
      </p>
      <div className="mt-3 grid gap-2">
        {sources.map((source) => (
          <div key={source.sourceId} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-slate-200">{source.name}</span>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.56rem] font-bold text-slate-300">
              {source.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
