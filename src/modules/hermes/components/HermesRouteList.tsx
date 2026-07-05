import type { HermesRoute } from "@/modules/hermes/types";
import HermesRouteCard from "@/modules/hermes/components/HermesRouteCard";

interface Props {
  routes: HermesRoute[];
  onSelect?: (route: HermesRoute) => void;
}

export default function HermesRouteList({ routes, onSelect }: Props) {
  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Rutas sugeridas</h2>
        <span className="text-[0.6rem] text-slate-500">{routes.length} ruta(s)</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {routes.length === 0 && (
          <p className="text-xs text-slate-500">Calcula una ruta para ver resultados aquí.</p>
        )}
        {routes.map((route) => (
          <HermesRouteCard key={route.id} route={route} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
