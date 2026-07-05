interface Kpi {
  label: string;
  value: string | number;
}

interface Props {
  kpis: Kpi[];
}

export default function HermesKpiGrid({ kpis }: Props) {
  return (
    <section className="grid gap-3 px-4 py-4 sm:px-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9" aria-label="Indicadores HERMES">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-400">{kpi.label}</p>
          <p className="mt-1 text-xl font-bold text-white">{kpi.value}</p>
        </div>
      ))}
    </section>
  );
}
