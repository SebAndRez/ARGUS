import type { ArgusNormalizedEvent } from "@/types/ingestion";

interface Props {
  event: ArgusNormalizedEvent;
  isSelected?: boolean;
}

const severityClasses: Record<ArgusNormalizedEvent["severity"], string> = {
  low: "border-cyan-100/75 bg-cyan-500 text-slate-950",
  medium: "border-amber-100/75 bg-amber-400 text-slate-950",
  high: "border-orange-100/80 bg-orange-500 text-white",
  critical: "border-red-100/80 bg-red-600 text-white",
};

const gdacsAlertClasses = {
  green: "border-emerald-100/80 bg-emerald-500 text-slate-950",
  orange: "border-orange-100/80 bg-orange-500 text-white",
  red: "border-red-100/80 bg-red-600 text-white",
  unknown: "border-amber-100/75 bg-amber-400 text-slate-950",
};

const categoryCodes: Partial<Record<ArgusNormalizedEvent["category"], string>> = {
  earthquake: "EQ",
  flood: "FL",
  cyclone: "TC",
  volcano: "VO",
  drought: "DR",
  wildfire: "WF",
  unknown: "GD",
  tsunami: "TSU",
};

export default function ExternalEventMarker({
  event,
  isSelected = false,
}: Props) {
  const isGdacs = event.sourceId === "gdacs";
  const isNoaa = event.sourceId === "noaa_tsunami";
  const markerLabel =
    isGdacs || isNoaa
      ? categoryCodes[event.category] ?? "EXT"
      : typeof event.rawMagnitude === "number"
        ? event.rawMagnitude.toFixed(1)
        : "EQ";
  const sourceLabel = isGdacs ? "GDACS" : isNoaa ? "NOAA" : "USGS";
  const presentationClass = isGdacs
    ? gdacsAlertClasses[event.rawAlertLevel ?? "unknown"]
    : severityClasses[event.severity];

  return (
    <div
      className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 font-mono text-[0.65rem] font-black shadow-[0_0_20px_rgba(249,115,22,0.35)] ring-1 ring-white/45 ${presentationClass} ${
        isSelected ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-slate-950" : ""
      }`}
      aria-hidden="true"
    >
      {markerLabel}
      <span
        className={`absolute -bottom-2 rounded-sm border px-1 py-0.5 text-[0.42rem] font-black leading-none text-white ${
          isGdacs
            ? "border-blue-200/50 bg-blue-700"
            : isNoaa
              ? "border-sky-200/50 bg-sky-700"
              : "border-red-200/50 bg-red-700"
        }`}
      >
        {sourceLabel}
      </span>
    </div>
  );
}
