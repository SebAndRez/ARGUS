"use client";

import { useEffect, useState } from "react";

type HudMode = "citizen" | "command";
type HudRole = "civil" | "operator" | "admin" | "police" | "fire" | "ems" | "maritime";
type HudGpsStatus = "active" | "inactive" | "unknown";
type HudSystemStatus = "online" | "degraded" | "offline";

interface Props {
  mode: HudMode;
  role?: HudRole;
  coordinates?: { latitude: number; longitude: number } | null;
  gpsStatus?: HudGpsStatus;
  systemStatus?: HudSystemStatus;
  activeLayerCount?: number;
  eventCount?: number;
  criticalCount?: number;
  onClose?: () => void;
}

interface TimeState {
  time: string;
  timezone: string;
  utcOffset: string;
}

const roleLabels: Record<HudRole, string> = {
  civil: "Civil",
  operator: "Operador",
  admin: "Admin",
  police: "Policía",
  fire: "Bomberos",
  ems: "EMS / Salud",
  maritime: "Marítimo",
};

const systemPresentation: Record<HudSystemStatus, { label: string; className: string }> = {
  online: { label: "Online", className: "text-emerald-300" },
  degraded: { label: "Degradado", className: "text-amber-300" },
  offline: { label: "Offline", className: "text-slate-400" },
};

function formatUtcOffset(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

export default function ArgusOperationalHUD({
  mode,
  role = mode === "citizen" ? "civil" : "operator",
  coordinates,
  gpsStatus = "unknown",
  systemStatus = "online",
  activeLayerCount,
  eventCount,
  criticalCount,
  onClose,
}: Props) {
  const [timeState, setTimeState] = useState<TimeState>({
    time: "--:--",
    timezone: "Zona local",
    utcOffset: "UTC",
  });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeState({
        time: new Intl.DateTimeFormat("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(now),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Zona local",
        utcOffset: formatUtcOffset(now),
      });
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const latitude = Number(coordinates?.latitude);
  const longitude = Number(coordinates?.longitude);
  const coordinateLabel =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      : "Sin coordenadas";
  const system = systemPresentation[systemStatus];

  const metrics = [
    { label: "GPS", value: gpsStatus === "active" ? "Activo" : gpsStatus === "inactive" ? "Inactivo" : "Desconocido" },
    { label: "Posición", value: coordinateLabel },
    { label: "Hora", value: timeState.time },
    { label: "Zona", value: `${timeState.timezone} · ${timeState.utcOffset}` },
    { label: "Sistema", value: system.label, valueClassName: system.className },
    ...(typeof activeLayerCount === "number" ? [{ label: "Capas", value: String(activeLayerCount) }] : []),
    ...(typeof eventCount === "number" ? [{ label: "Eventos", value: String(eventCount) }] : []),
    ...(typeof criticalCount === "number" ? [{ label: "Críticos", value: String(criticalCount), valueClassName: "text-red-300" }] : []),
  ];

  return (
    <section className="argus-hud border border-cyan-300/15 bg-slate-950/95 p-3 shadow-2xl shadow-black/35 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
            ARGUS GRID
          </p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-white">
            {mode === "citizen" ? "Modo ciudadano" : "Centro de mando"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[0.62rem] font-semibold uppercase text-slate-300">
            {roleLabels[role]}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="border border-white/10 bg-slate-950/70 px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-400 hover:text-white"
            >
              Ocultar
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-24 flex-1 border-l border-white/10 pl-2">
            <p className="text-[0.56rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {metric.label}
            </p>
            <p className={`mt-1 truncate text-xs font-semibold text-slate-200 ${metric.valueClassName ?? ""}`} title={metric.value}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
