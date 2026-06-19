const legendItems = [
  { label: "Fuente oficial", color: "bg-red-500" },
  { label: "Cámara abierta", color: "bg-purple-500" },
  { label: "ARGUS verificado", color: "bg-cyan-400" },
  { label: "Sismo USGS", color: "bg-orange-500 ring-1 ring-red-300/70" },
  { label: "Pendiente", color: "bg-amber-300" },
  { label: "Offline", color: "bg-slate-500" },
  { label: "Riesgo estimado", color: "bg-orange-500" },
];

const routeItems = [
  { label: "Terrestre", color: "bg-emerald-400" },
  { label: "Aérea", color: "bg-violet-400", dashed: true },
  { label: "Marítima", color: "bg-cyan-400", dashed: true },
];

export default function MapLegend() {
  return (
    <section className="border-t border-white/10 pt-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Leyenda
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {legendItems.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`} aria-hidden="true" />
            <span className="truncate text-[0.65rem] text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-slate-600">
        Rutas
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {routeItems.map((item) => (
          <div key={item.label} className="min-w-0">
            <span
              className={`block h-0.5 w-full ${item.color} ${
                item.dashed
                  ? "opacity-80 [mask-image:repeating-linear-gradient(to_right,#000_0_5px,transparent_5px_9px)]"
                  : ""
              }`}
              aria-hidden="true"
            />
            <span className="mt-1 block truncate text-[0.58rem] text-slate-500">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
