import { getOpenAqAdapterStatus } from "@/lib/knowledge-intake/adapters/openAqAdapter";

export default function OpenAqAirQualityPanel() {
  const status = getOpenAqAdapterStatus();
  return (
    <section className="rounded-lg border border-emerald-300/15 bg-emerald-400/8 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-emerald-200">
            OpenAQ Air Quality Context
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">Observaciones respiratorias contextuales</h3>
        </div>
        <span className="rounded-full border border-emerald-200/20 bg-slate-950/70 px-2 py-1 text-[0.56rem] font-bold uppercase text-emerald-100">
          {status.status}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-3">
        <div className="rounded border border-white/10 bg-slate-950/50 p-3">
          <p className="font-semibold text-emerald-100">Fuente</p>
          <p className="mt-1">Provider-dependent, requires {status.envVar}. Not an incident source.</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/50 p-3">
          <p className="font-semibold text-emerald-100">Panel</p>
          <p className="mt-1">Shows location, PM2.5/PM10/O3/NO2/SO2/CO, observedAt, staleness, provider, owner and license when context is attached.</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/50 p-3">
          <p className="font-semibold text-emerald-100">Caveat</p>
          <p className="mt-1">No P0/P1, SOS, public alert, diagnosis or evacuation order from isolated OpenAQ measurements.</p>
        </div>
      </div>
    </section>
  );
}
