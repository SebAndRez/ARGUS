import { findSimilarIncidents } from "@/lib/knowledge-intake/similarityEngine";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

export default function SimilarIncidentsPanel({ incident }: { incident: ArgusIncidentKnowledge }) {
  const similar = findSimilarIncidents(incident, 4);
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/75 p-5">
      <p className="text-xs font-semibold uppercase text-cyan-200">Similarity Engine</p>
      <h2 className="mt-1 text-xl font-semibold text-white">Incidentes historicos similares</h2>
      <div className="mt-4 grid gap-3">
        {similar.map((item) => (
          <article key={item.incident.id} className="rounded border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">{item.incident.title}</h3>
              <span className="rounded bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-100">
                {item.similarityScore}%
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">{item.warningText}</p>
            <p className="mt-2 text-xs text-slate-500">{item.matchedFactors.join(" | ")}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
