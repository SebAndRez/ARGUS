import type { FenixSimulationResult } from "@/types/fenixSimulation";

export default function FenixNearbyContextPanel({ result }: { result: FenixSimulationResult }) {
  const context = result.geoContext as {
    summary?: string;
    terrainContext?: string;
    nearbyRoutes?: Array<{ id: string; name: string; status: string; sourceType: string }>;
  } | undefined;
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
      <h3 className="text-sm font-semibold uppercase text-white">Análisis de entorno</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{context?.summary ?? "Contexto demo no disponible."}</p>
      <p className="mt-1 text-xs text-slate-500">Terreno/contexto: {context?.terrainContext ?? "estimado"}</p>
      <div className="mt-3 grid gap-2">
        {(result.nearbySettlements ?? []).slice(0, 4).map((settlement) => (
          <div key={String(settlement.id)} className="rounded border border-white/10 bg-white/[0.03] p-2 text-xs text-slate-300">
            {String(settlement.name)} · {String(settlement.distanceKm)} km · población demo {String(settlement.population)}
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {(context?.nearbyRoutes ?? []).map((route) => (
          <div key={route.id} className="rounded border border-white/10 bg-white/[0.03] p-2 text-xs text-slate-300">
            {route.name} · {route.status} · {route.sourceType}
          </div>
        ))}
      </div>
    </section>
  );
}

