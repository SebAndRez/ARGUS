export default function SmithsonianGvpVolcanoIntelligencePanel() {
  return (
    <section className="rounded-md border border-amber-300/15 bg-slate-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-amber-200/80">
            Smithsonian GVP Volcano Intelligence
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">Memoria volcánica global</h3>
        </div>
        <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[0.55rem] font-bold uppercase text-amber-100">
          Not local alert
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
        {["Catalog", "History", "Recent Report", "Official Alert"].map((item) => (
          <div key={item} className="border border-white/8 bg-black/20 p-2">
            <p className="text-[0.56rem] font-bold uppercase tracking-[0.14em] text-slate-500">{item}</p>
            <p className="mt-1 text-slate-300">
              {item === "Official Alert"
                ? "USGS HANS/local observatory has priority."
                : item === "Recent Report"
                  ? "DVAR/WVAR preliminary, requires review."
                  : "Evidence/context only; no incident creation."}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.68rem] leading-relaxed text-slate-500">
        GVP supports volcano baseline, eruption history, Fenix, NAV, AURA, Risk and map context. It does not issue evacuations, close routes, model ashfall or replace observatories.
      </p>
    </section>
  );
}
