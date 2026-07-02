import SourceReliabilityBadge from "@/components/dashboard/SourceReliabilityBadge";
import type { ArgusKnowledgeSource } from "@/types/knowledgeIntake";

export default function KnowledgeSourceRegistryPanel({ sources }: { sources: ArgusKnowledgeSource[] }) {
  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/75 p-5 shadow-xl shadow-black/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-cyan-200">Source Registry</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Fuentes de conocimiento</h2>
        </div>
        <span className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
          {sources.length} registradas
        </span>
      </div>
      <div className="mt-5 grid gap-3">
        {sources.map((source) => (
          <article key={source.id} className="rounded border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{source.name}</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{source.description}</p>
              </div>
              <SourceReliabilityBadge score={source.reliabilityScore} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-cyan-400/10 px-2 py-1 text-cyan-100">{source.status}</span>
              <span className="rounded bg-white/[0.05] px-2 py-1 text-slate-300">{source.accessMethod}</span>
              <span className="rounded bg-white/[0.05] px-2 py-1 text-slate-300">{source.licenseType}</span>
              <span className="rounded bg-white/[0.05] px-2 py-1 text-slate-300">{source.coverage.global ? "global" : source.coverage.countries?.join(", ")}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {source.domains.slice(0, 8).map((domain) => (
                <span key={domain} className="rounded border border-white/10 px-2 py-1 text-[0.7rem] text-slate-300">
                  {domain}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
