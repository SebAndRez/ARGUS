"use client";

import type { ConflictEvent, ConflictZone } from "@/types/conflictZone";
import type { NewsEvidence } from "@/types/newsEvidence";

interface Props {
  zone: ConflictZone | null;
  events?: ConflictEvent[];
  newsEvidence?: NewsEvidence[];
  onClose: () => void;
}

const riskClass: Record<ConflictZone["riskLevel"], string> = {
  low: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  medium: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  high: "border-orange-300/30 bg-orange-500/10 text-orange-100",
  critical: "border-red-300/35 bg-red-500/15 text-red-100",
};

const zoneTypeLabel: Record<ConflictZone["zoneType"], string> = {
  war_zone: "zona de conflicto activo",
  disputed_control: "zona disputada",
  occupied_area: "zona bajo control militar reportado",
  recent_attack_area: "zona con ataques recientes",
  humanitarian_crisis: "zona con alerta humanitaria",
  border_tension: "zona de riesgo elevado",
  terrorism_risk: "zona de riesgo elevado",
  civil_unrest: "zona de riesgo elevado",
  disaster_confirmed: "zona con catastrofe confirmada",
};

export default function ConflictZonePanel({
  zone,
  events = [],
  newsEvidence = [],
  onClose,
}: Props) {
  if (!zone) return null;

  const relatedEvents = events.filter((event) => event.relatedZoneId === zone.id);
  const relatedNews = newsEvidence.filter((item) => item.linkedZoneId === zone.id);

  return (
    <aside className="pointer-events-auto fixed left-4 top-36 z-[58] max-h-[calc(100svh-11rem)] w-[360px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-red-300/20 bg-slate-950/94 p-4 shadow-2xl shadow-black/45 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-red-200/80">
            Zonas de conflicto
          </p>
          <h2 className="mt-1 break-words text-base font-semibold text-white">
            {zone.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-300"
        >
          Cerrar
        </button>
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`rounded border px-2 py-1 text-[0.58rem] font-bold uppercase ${riskClass[zone.riskLevel]}`}>
          {zone.riskLevel}
        </span>
        <span className="rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300">
          {zoneTypeLabel[zone.zoneType]}
        </span>
        {zone.controlStatus && (
          <span className="rounded border border-cyan-300/15 bg-cyan-400/8 px-2 py-1 text-[0.58rem] font-bold uppercase text-cyan-100">
            {zone.controlStatus}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">{zone.summary}</p>
      <p className="mt-3 rounded-md border border-amber-300/15 bg-amber-400/8 px-3 py-2 text-xs leading-5 text-amber-100">
        {zone.recommendedAction}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Info label="Region" value={zone.region} />
        <Info label="Pais" value={zone.country} />
        <Info label="Confianza" value={zone.confidence} />
        <Info label="Revision" value={zone.lastReviewedAt.slice(0, 10)} />
      </dl>

      <section className="mt-4 border-t border-white/10 pt-3">
        <p className="text-[0.62rem] font-bold uppercase text-slate-500">
          Fuentes y evidencia
        </p>
        <div className="mt-2 grid gap-2">
          {zone.sources.map((source) => (
            <div key={`${zone.id}-${source.sourceName}`} className="rounded border border-white/8 bg-slate-900/55 p-2">
              <p className="text-xs font-semibold text-white">{source.sourceName}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{source.summary}</p>
            </div>
          ))}
          {relatedNews.slice(0, 3).map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/8 bg-slate-900/55 p-2 text-xs text-cyan-100 hover:border-cyan-300/25"
            >
              {item.sourceName}: {item.title}
            </a>
          ))}
        </div>
      </section>

      {relatedEvents.length > 0 && (
        <section className="mt-4 border-t border-white/10 pt-3">
          <p className="text-[0.62rem] font-bold uppercase text-slate-500">
            Eventos recientes
          </p>
          <div className="mt-2 grid gap-2">
            {relatedEvents.slice(0, 4).map((event) => (
              <div key={event.id} className="rounded border border-white/8 bg-black/20 p-2">
                <p className="text-xs font-semibold text-white">{event.title}</p>
                <p className="mt-1 text-[0.62rem] text-slate-400">
                  {event.sourceName} · {event.confidence} · {event.occurredAt.slice(0, 10)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-4 rounded border border-white/10 bg-slate-900/55 px-3 py-2 text-[0.65rem] leading-5 text-slate-400">
        Informacion basada en fuentes abiertas. Puede estar incompleta o
        desactualizada. Verifique fuentes oficiales antes de desplazarse.
      </p>
    </aside>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/8 bg-slate-900/55 p-2">
      <dt className="text-[0.56rem] font-bold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-slate-200" title={value}>
        {value}
      </dd>
    </div>
  );
}
