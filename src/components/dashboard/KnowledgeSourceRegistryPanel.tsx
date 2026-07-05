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
              {source.tags.includes("official_noaa") && <span className="rounded bg-sky-400/10 px-2 py-1 text-sky-100">Official NOAA</span>}
              {source.tags.includes("ioc_slsmf") && <span className="rounded bg-cyan-400/10 px-2 py-1 text-cyan-100">IOC / SLSMF</span>}
              {source.tags.includes("global_sea_level_context") && <span className="rounded bg-blue-400/10 px-2 py-1 text-blue-100">Global Sea Level Context</span>}
              {source.tags.includes("no_api_key") && <span className="rounded bg-emerald-400/10 px-2 py-1 text-emerald-100">No API key</span>}
              {source.tags.includes("apiKeyRequired:true") && <span className="rounded bg-amber-400/10 px-2 py-1 text-amber-100">Requires API key</span>}
              {source.tags.includes("isIncidentLayer:false") && <span className="rounded bg-slate-400/10 px-2 py-1 text-slate-200">Not incident source</span>}
              {source.tags.includes("communitySource:true") && <span className="rounded bg-lime-400/10 px-2 py-1 text-lime-100">Community source</span>}
              {source.tags.includes("officialSource:false") && <span className="rounded bg-slate-400/10 px-2 py-1 text-slate-200">Not official registry</span>}
              {source.tags.includes("licenseStatus:ODbL") && <span className="rounded bg-lime-400/10 px-2 py-1 text-lime-100">ODbL attribution required</span>}
              {source.tags.includes("cacheRequired:true") && <span className="rounded bg-lime-400/10 px-2 py-1 text-lime-100">Cache required</span>}
              {source.tags.includes("datumRequired:true") && <span className="rounded bg-amber-400/10 px-2 py-1 text-amber-100">Datum required</span>}
              {source.tags.includes("relativeSeaLevel:true") && <span className="rounded bg-teal-400/10 px-2 py-1 text-teal-100">Relative sea level</span>}
              {source.tags.includes("datumCaution:true") && <span className="rounded bg-orange-400/10 px-2 py-1 text-orange-100">Datum caution</span>}
              {source.tags.includes("observedVsPredictedSeparated:true") && <span className="rounded bg-cyan-400/10 px-2 py-1 text-cyan-100">Observed vs Predicted</span>}
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
