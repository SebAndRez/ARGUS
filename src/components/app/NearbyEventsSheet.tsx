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

export default function NearbyEventsSheet({ events, latitude, longitude, onSelect }: Props) {
  const sorted = [...events].sort(
    (a, b) => getDistance(latitude, longitude, a.latitude, a.longitude) - getDistance(latitude, longitude, b.latitude, b.longitude)
  );

  return (
    <aside className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 mx-auto max-w-5xl rounded-t-[28px] border border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur-xl shadow-2xl shadow-black/40 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm uppercase tracking-[0.24em] text-cyan-300/85">
        <span>Eventos cercanos</span>
        <span className="rounded-full bg-slate-900/70 px-3 py-1 text-[0.7rem] text-slate-300">{sorted.length} activos</span>
      </div>
      <div className="grid gap-3">
        {sorted.slice(0, 5).map((event) => {
          const distance = getDistance(latitude, longitude, event.latitude, event.longitude);
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event)}
              className="group flex w-full items-center justify-between gap-3 rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-left transition hover:border-cyan-400/30 hover:bg-cyan-500/10"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                  {event.type === "SOS" ? "SOS" : event.severity === "CRITICAL" ? "!!" : event.type === "ALERT" ? "⚠" : "REP"}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{event.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{event.category} · {severityLabel(event.severity)}</p>
                </div>
              </div>
              <div className="text-right text-sm text-slate-300">
                <p>{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</p>
                <p className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-cyan-300">{event.status}</p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
