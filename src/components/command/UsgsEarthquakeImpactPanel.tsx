export default function UsgsEarthquakeImpactPanel() {
  return (
    <section className="rounded-md border border-cyan-300/15 bg-slate-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-cyan-200/80">
            USGS Earthquake Impact
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">ShakeMap / PAGER enrichment</h3>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[0.55rem] font-bold uppercase text-cyan-100">
          Estimated
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
        {["Detected earthquake", "Estimated shaking", "Estimated impact", "Confirmed local reports"].map((item) => (
          <div key={item} className="border border-white/8 bg-black/20 p-2">
            <p className="text-[0.56rem] font-bold uppercase tracking-[0.14em] text-slate-500">{item}</p>
            <p className="mt-1 text-slate-300">
              {item === "Estimated shaking"
                ? "MMI/PGA/PGV/contours when products exist."
                : item === "Estimated impact"
                  ? "PAGER exposure/loss alerts are modelled."
                  : item === "Confirmed local reports"
                    ? "Requires local authority/field evidence."
                    : "USGS Earthquake remains the base event source."}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.68rem] leading-relaxed text-slate-500">
        Priority uses PAGER, MMI and exposure context, not magnitude alone. It does not confirm deaths, damage, evacuations or route closures.
      </p>
    </section>
  );
}
