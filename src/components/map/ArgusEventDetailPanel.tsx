"use client";

import type { ArgusEvent, ArgusSeverity } from "@/types/argusEvent";

interface Props {
  event: ArgusEvent | null;
  onClose: () => void;
}

const severityClass: Record<ArgusSeverity, string> = {
  info: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  low: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  medium: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  high: "border-orange-300/30 bg-orange-500/10 text-orange-100",
  critical: "border-red-300/35 bg-red-500/15 text-red-100",
};

const sourceTypeLabel: Record<ArgusEvent["sourceType"], string> = {
  official: "fuente oficial directa",
  technical: "fuente técnica directa",
  news: "prensa nacional",
  regional_news: "prensa regional",
  municipal: "fuente municipal",
  social_official: "canal social oficial",
  citizen: "reporte ciudadano",
  global_feed: "feed global",
  model_context: "contexto de modelo",
};

const statusLabel: Record<ArgusEvent["status"], string> = {
  observation: "observación",
  risk: "riesgo",
  active: "activo",
  confirmed: "confirmado",
  monitoring: "en vigilancia",
  resolved: "resuelto",
  archived: "archivado",
};

export default function ArgusEventDetailPanel({ event, onClose }: Props) {
  if (!event) return null;

  const [primarySource, ...secondarySources] = event.sources;
  const location = [event.commune, event.province, event.region, event.country]
    .filter(Boolean)
    .join(" · ");

  return (
    <aside className="pointer-events-auto fixed left-4 top-36 z-[58] max-h-[calc(100svh-11rem)] w-[360px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-amber-300/20 bg-slate-950/94 p-4 shadow-2xl shadow-black/45 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-amber-200/80">
            ARGUS · {event.eventType.replaceAll("_", " ")}
          </p>
          <h2 className="mt-1 break-words text-base font-semibold text-white">{event.title}</h2>
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
        <span className={`rounded border px-2 py-1 text-[0.58rem] font-bold uppercase ${severityClass[event.severity]}`}>
          {event.severity}
        </span>
        <span className="rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300">
          {statusLabel[event.status]}
        </span>
        <span className="rounded border border-cyan-300/15 bg-cyan-400/8 px-2 py-1 text-[0.58rem] font-bold uppercase text-cyan-100">
          confianza {event.confidence}
        </span>
        {event.needsOfficialConfirmation && (
          <span className="rounded border border-fuchsia-300/25 bg-fuchsia-500/10 px-2 py-1 text-[0.58rem] font-bold uppercase text-fuchsia-100">
            Pendiente confirmación oficial
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">{event.operationalSummary}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Info label="Atribución" value={event.attribution} />
        <Info label="Tipo de fuente" value={sourceTypeLabel[event.sourceType]} />
        <Info label="Región/zona" value={location || "—"} />
        <Info label="Última actualización" value={event.lastUpdated.slice(0, 16).replace("T", " ")} />
      </dl>

      {event.officialAuthorityMentioned && event.officialAuthorityMentioned.length > 0 && (
        <p className="mt-3 rounded-md border border-fuchsia-300/15 bg-fuchsia-500/8 px-3 py-2 text-xs leading-5 text-fuchsia-100">
          Autoridad oficial mencionada en la fuente: {event.officialAuthorityMentioned.join(", ")}.
          Sin confirmación directa todavía.
        </p>
      )}

      {event.recommendedActions && event.recommendedActions.length > 0 && (
        <section className="mt-4 border-t border-white/10 pt-3">
          <p className="text-[0.62rem] font-bold uppercase text-slate-500">Recomendaciones operativas</p>
          <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-amber-100">
            {event.recommendedActions.map((action) => (
              <li key={action} className="rounded border border-amber-300/15 bg-amber-400/8 px-3 py-2">
                {action}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 border-t border-white/10 pt-3">
        <p className="text-[0.62rem] font-bold uppercase text-slate-500">Fuente primaria</p>
        {primarySource && (
          <div className="mt-2 rounded border border-white/8 bg-slate-900/55 p-2">
            <p className="text-xs font-semibold text-white">{primarySource.sourceName}</p>
            <p className="mt-1 text-[0.62rem] text-slate-400">{sourceTypeLabel[primarySource.sourceType]}</p>
          </div>
        )}
        {secondarySources.length > 0 && (
          <>
            <p className="mt-3 text-[0.62rem] font-bold uppercase text-slate-500">Fuentes secundarias</p>
            <div className="mt-2 grid gap-2">
              {secondarySources.map((source) => (
                <div key={source.sourceId} className="rounded border border-white/8 bg-slate-900/55 p-2">
                  <p className="text-xs font-semibold text-white">{source.sourceName}</p>
                  <p className="mt-1 text-[0.62rem] text-slate-400">{sourceTypeLabel[source.sourceType]}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <p className="mt-4 rounded border border-white/10 bg-slate-900/55 px-3 py-2 text-[0.65rem] leading-5 text-slate-400">
        {event.isDemo
          ? "Dato curado (piloto Chile). Representa el formato que produciría la ingesta real una vez conectada a la fuente en vivo."
          : "Información basada en fuentes registradas por ARGUS. Verifique canales oficiales antes de tomar decisiones críticas."}
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
