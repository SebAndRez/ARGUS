import { VESTA_THREAT_GUIDES } from "@/modules/vesta/data";

export default function VestaThreatGuides() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {VESTA_THREAT_GUIDES.map((guide) => (
        <article key={guide.threatType} className="border border-white/10 bg-white/[0.03] p-3">
          <h4 className="text-sm font-bold uppercase tracking-[0.08em] text-emerald-200">{guide.title}</h4>
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
            {guide.recommendations.map((tip) => (
              <li key={tip}>· {tip}</li>
            ))}
          </ul>
          <p className="mt-2 text-[0.6rem] uppercase tracking-[0.1em] text-slate-600">
            Fuentes de referencia: {guide.sourceReferences.map((source) => source.name).join(" · ")}
          </p>
        </article>
      ))}
    </div>
  );
}
