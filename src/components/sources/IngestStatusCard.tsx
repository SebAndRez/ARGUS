import SourceHealthBadge from "@/components/sources/SourceHealthBadge";
import type { SourceHealthView } from "@/lib/sources/sourceHealthEngine";

export default function IngestStatusCard({ source }: { source: SourceHealthView }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{source.name}</p>
          <p className="mt-1 text-[0.62rem] uppercase tracking-[0.12em] text-slate-500">
            {source.category} / {source.reliability}
          </p>
        </div>
        <SourceHealthBadge status={source.status} />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{source.freshnessLabel}</p>
      {source.warnings[0] ? (
        <p className="mt-2 rounded border border-amber-300/15 bg-amber-400/8 p-2 text-xs leading-5 text-amber-100">
          {source.warnings[0]}
        </p>
      ) : null}
    </article>
  );
}
