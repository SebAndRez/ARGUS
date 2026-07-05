import type { AtlasIncidentSummary } from "@/modules/atlas/types";
import { atlasSeverityLabel, atlasSeverityTone, formatRelativeTime } from "@/modules/atlas/utils";

interface Props {
  incidents: AtlasIncidentSummary[];
  onSelect?: (incident: AtlasIncidentSummary) => void;
}

const statusLabel: Record<AtlasIncidentSummary["status"], string> = {
  new: "Nuevo",
  monitoring: "En monitoreo",
  confirmed: "Confirmado",
  resolved: "Resuelto",
};

export default function AtlasIncidentFeed({ incidents, onSelect }: Props) {
  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Feed de incidentes
        </h2>
        <span className="text-[0.6rem] text-slate-500">{incidents.length} activos</span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {incidents.length === 0 && (
          <p className="text-xs text-slate-500">Sin incidentes activos por el momento.</p>
        )}
        {incidents.map((incident) => (
          <button
            key={incident.id}
            type="button"
            onClick={() => onSelect?.(incident)}
            className="w-full border border-white/10 bg-white/[0.02] p-2.5 text-left transition hover:border-cyan-300/25 hover:bg-cyan-400/5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-white">{incident.title}</p>
              <span
                className={`shrink-0 border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${atlasSeverityTone[incident.severity]}`}
              >
                {atlasSeverityLabel[incident.severity]}
              </span>
            </div>
            <p className="mt-1 text-[0.65rem] text-slate-500">
              {incident.type} · {incident.locationLabel} · {statusLabel[incident.status]}
            </p>
            <p className="mt-1 text-[0.6rem] text-slate-600">
              {formatRelativeTime(incident.updatedAt)} · {incident.sourceCount} fuente(s) ·{" "}
              {incident.citizenReportCount} reporte(s) ciudadano(s)
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
