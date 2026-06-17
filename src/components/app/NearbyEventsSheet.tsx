"use client";

import type { CrisisEvent } from "@/types/crisis";

interface Props {
  events: CrisisEvent[];
  latitude: number;
  longitude: number;
  onSelect: (event: CrisisEvent) => void;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function severityLabel(severity: CrisisEvent["severity"]) {
  switch (severity) {
    case "LOW":
      return "Baja";
    case "MEDIUM":
      return "Media";
    case "HIGH":
      return "Alta";
    default:
      return "Crítica";
  }
}

function severityStyles(severity: CrisisEvent["severity"]) {
  switch (severity) {
    case "LOW":
      return {
        accent: "bg-cyan-400",
        badge: "border-cyan-300/25 bg-cyan-400/10 text-cyan-200",
      };
    case "MEDIUM":
      return {
        accent: "bg-amber-300",
        badge: "border-amber-300/25 bg-amber-400/10 text-amber-200",
      };
    case "HIGH":
      return {
        accent: "bg-orange-400",
        badge: "border-orange-300/25 bg-orange-400/10 text-orange-200",
      };
    default:
      return {
        accent: "bg-red-500",
        badge: "border-red-300/30 bg-red-500/15 text-red-100",
      };
  }
}

function eventTypeLabel(type: CrisisEvent["type"]) {
  if (type === "SOS") return "SOS";
  if (type === "ALERT") return "Alerta";
  return "Reporte";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    NEW: "Nuevo",
    RECEIVED: "Recibido",
    UNDER_REVIEW: "En revisión",
    VALIDATED: "Validado",
    ASSIGNED: "Asignado",
    ESCALATED: "Escalado",
    RESOLVED: "Resuelto",
    DISCARDED: "Descartado",
    CANCELLED: "Cancelado",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

export default function NearbyEventsSheet({ events, latitude, longitude, onSelect }: Props) {
  const nearbyEvents = events
    .map((event) => ({
      event,
      distance: getDistance(latitude, longitude, event.latitude, event.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  return (
    <aside className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 mx-auto max-w-5xl rounded-t-lg border border-white/10 bg-slate-950/92 px-4 pb-4 pt-3 backdrop-blur-xl shadow-[0_-18px_48px_rgba(0,0,0,0.42)] sm:px-6">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-600/70 sm:hidden" />

      <div className="mr-40 mb-3 flex min-h-7 items-center justify-between gap-3 2xl:mr-0">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase text-cyan-300/80">Perímetro cercano</p>
          <p className="mt-1 text-xs text-slate-400">Ordenado por distancia</p>
        </div>
        <span className="shrink-0 rounded-md border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[0.65rem] font-semibold uppercase text-slate-300">
          {events.length} activos
        </span>
      </div>

      <div className="mr-40 overflow-hidden 2xl:mr-0">
        <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nearbyEvents.map(({ event, distance }) => {
            const severity = severityStyles(event.severity);
            const formattedDistance = distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelect(event)}
                className="group relative min-h-28 min-w-full snap-start overflow-hidden rounded-lg border border-white/10 bg-slate-900/90 px-3.5 py-3 text-left transition hover:border-cyan-300/35 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-300/70 sm:min-w-[260px] sm:max-w-[300px]"
                aria-label={`Ver ${event.title}, ${formattedDistance}`}
              >
                <span className={`absolute inset-y-0 left-0 w-1 ${severity.accent}`} />

                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-md border px-2 py-1 text-[0.6rem] font-bold uppercase ${severity.badge}`}>
                    {eventTypeLabel(event.type)} · {severityLabel(event.severity)}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-semibold text-white">{formattedDistance}</span>
                </div>

                <p className="mt-2 truncate text-sm font-semibold text-white">{event.title}</p>

                <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/8 pt-2">
                  <span className="truncate text-xs text-slate-400">{event.category}</span>
                  <span className="shrink-0 text-[0.62rem] font-semibold uppercase text-cyan-300">
                    {statusLabel(event.status)}
                  </span>
                </div>
              </button>
            );
          })}

          {nearbyEvents.length === 0 && (
            <div className="flex min-h-28 min-w-full items-center rounded-lg border border-dashed border-white/10 bg-slate-900/60 px-4 text-sm text-slate-400">
              Sin eventos activos en el perímetro.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
