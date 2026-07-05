import type { OraculoSource } from "@/modules/oraculo/types";
import {
  oraculoCommercialUseLabel,
  oraculoCommercialUseTone,
  oraculoReliabilityTierLabel,
  oraculoSourceStatusLabel,
  oraculoSourceStatusTone,
} from "@/modules/oraculo/utils";

interface Props {
  sources: OraculoSource[];
}

export default function OraculoSourceRegistryPanel({ sources }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">
          Registro de fuentes
        </h2>
        <span className="text-[0.6rem] text-slate-500">{sources.length} fuentes</span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[0.6rem] uppercase tracking-[0.08em] text-slate-500">
              <th className="py-1.5 pr-2">Nombre</th>
              <th className="py-1.5 pr-2">Categoría</th>
              <th className="py-1.5 pr-2">Cobertura</th>
              <th className="py-1.5 pr-2">Estado</th>
              <th className="py-1.5 pr-2">Confiabilidad</th>
              <th className="py-1.5 pr-2">Uso comercial</th>
              <th className="py-1.5 pr-2">API key</th>
              <th className="py-1.5">Notas</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-b border-white/5 align-top text-slate-300">
                <td className="py-2 pr-2 font-semibold text-white">{source.name}</td>
                <td className="py-2 pr-2 capitalize">{source.category.replace(/_/g, " ")}</td>
                <td className="py-2 pr-2 capitalize">{source.coverage}</td>
                <td className="py-2 pr-2">
                  <span className={`border px-1.5 py-0.5 text-[0.58rem] font-bold uppercase ${oraculoSourceStatusTone[source.status]}`}>
                    {oraculoSourceStatusLabel[source.status]}
                  </span>
                </td>
                <td className="py-2 pr-2 text-[0.65rem] text-slate-400">
                  {oraculoReliabilityTierLabel[source.reliabilityTier]}
                </td>
                <td className="py-2 pr-2">
                  <span
                    className={`border px-1.5 py-0.5 text-[0.58rem] font-bold uppercase ${oraculoCommercialUseTone[source.commercialUseStatus]}`}
                  >
                    {oraculoCommercialUseLabel[source.commercialUseStatus]}
                  </span>
                  {source.requiresLicenseReview && (
                    <span className="ml-1 border border-amber-300/30 bg-amber-400/8 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase text-amber-100">
                      Requiere revisión
                    </span>
                  )}
                </td>
                <td className="py-2 pr-2">{source.requiresApiKey ? "Sí" : "No"}</td>
                <td className="py-2 max-w-[220px] text-[0.62rem] text-slate-500">{source.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
