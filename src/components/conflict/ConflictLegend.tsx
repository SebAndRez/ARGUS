"use client";

interface Props {
  zoneCount: number;
  eventCount: number;
  newsCount: number;
}

export default function ConflictLegend({ zoneCount, eventCount, newsCount }: Props) {
  return (
    <section className="rounded-lg border border-red-300/15 bg-slate-950/80 p-3 text-xs text-slate-300">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-red-200/80">
        Conflictos
      </p>
      <div className="mt-2 grid gap-1.5">
        <LegendRow color="bg-red-500/70" label={`${zoneCount} zonas`} />
        <LegendRow color="bg-orange-400/70" label={`${eventCount} ataques/eventos`} />
        <LegendRow color="bg-cyan-300/70" label={`${newsCount} evidencias noticia`} />
      </div>
      <p className="mt-2 text-[0.62rem] leading-4 text-slate-500">
        Fuentes abiertas; no representa control territorial definitivo.
      </p>
    </section>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}
