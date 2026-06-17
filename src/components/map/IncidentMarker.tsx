import type { EventSeverity, EventType } from "@/types/crisis";

interface IncidentMarkerProps {
  severity: EventSeverity;
  type: EventType;
  isSelected?: boolean;
}

const severityStyles: Record<EventSeverity, string> = {
  LOW: "bg-emerald-400/95 border-emerald-200/40",
  MEDIUM: "bg-orange-400/95 border-orange-200/40",
  HIGH: "bg-red-500/95 border-red-300/40",
  CRITICAL: "bg-red-600/95 border-red-300/50 shadow-[0_0_24px_rgba(255,67,67,0.45)]",
};

const typeLabel: Record<EventType, string> = {
  REPORT: "R",
  SOS: "SOS",
  ALERT: "⚠",
};

export default function IncidentMarker({ severity, type, isSelected }: IncidentMarkerProps) {
  return (
    <div className={`group relative flex h-14 w-14 items-center justify-center rounded-full border-2 ${severityStyles[severity]} ${isSelected ? "scale-110 ring-2 ring-cyan-300/80" : ""}`}>
      <div className="absolute inset-0 rounded-full opacity-20 blur-xl" />
      <span className="relative z-10 text-xs font-extrabold uppercase tracking-[0.18em] text-slate-950">
        {typeLabel[type]}
      </span>
      {severity === "CRITICAL" && (
        <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
      )}
      {type === "SOS" && (
        <span className="pointer-events-none absolute inset-0 rounded-full border border-cyan-300/70 shadow-[0_0_20px_rgba(45,212,191,0.45)]" />
      )}
    </div>
  );
}
