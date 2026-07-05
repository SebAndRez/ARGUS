interface Layer {
  label: string;
  active: boolean;
  future?: boolean;
}

interface Props {
  layers: Layer[];
}

export default function HermesOperationalLayersPanel({ layers }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Capas operativas</h2>
      <ul className="mt-2 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
        {layers.map((layer) => (
          <li
            key={layer.label}
            className={`border px-2 py-1.5 ${
              layer.active ? "border-teal-300/25 bg-teal-400/8 text-teal-100" : "border-white/10 bg-white/[0.02] text-slate-500"
            }`}
          >
            {layer.label}
            {layer.future && <span className="ml-1 text-[0.55rem] uppercase text-slate-500">(futuro)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
