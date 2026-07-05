import type { OraculoSource } from "@/modules/oraculo/types";

interface Props {
  sources: OraculoSource[];
}

export default function OraculoSourceHealthPanel({ sources }: Props) {
  const active = sources.filter((s) => s.status === "active");
  const degraded = sources.filter((s) => s.status === "degraded");
  const manual = sources.filter((s) => s.status === "manual_review");
  const disabled = sources.filter((s) => s.status === "disabled");
  const planned = sources.filter((s) => s.status === "planned");
  const commercialDoubt = sources.filter((s) => s.commercialUseStatus === "requires_review" || s.commercialUseStatus === "unknown");

  const rows: { label: string; count: number; tone: string }[] = [
    { label: "Activas", count: active.length, tone: "text-emerald-200" },
    { label: "Degradadas", count: degraded.length, tone: "text-amber-200" },
    { label: "Revisión manual", count: manual.length, tone: "text-orange-200" },
    { label: "Deshabilitadas", count: disabled.length, tone: "text-red-300" },
    { label: "Planeadas", count: planned.length, tone: "text-cyan-200" },
    { label: "Uso comercial dudoso", count: commercialDoubt.length, tone: "text-amber-200" },
  ];

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">Salud de fuentes</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[0.6rem] uppercase text-slate-500">{row.label}</dt>
            <dd className={`font-semibold ${row.tone}`}>{row.count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
