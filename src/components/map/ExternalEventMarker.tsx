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

export default function ExternalEventMarker({
  event,
  isSelected = false,
}: Props) {
  const magnitude =
    typeof event.rawMagnitude === "number"
      ? event.rawMagnitude.toFixed(1)
      : "EQ";

  return (
    <div
      className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 font-mono text-[0.65rem] font-black shadow-[0_0_20px_rgba(249,115,22,0.35)] ring-1 ring-red-300/60 ${severityClasses[event.severity]} ${
        isSelected ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-slate-950" : ""
      }`}
      aria-hidden="true"
    >
      {magnitude}
      <span className="absolute -bottom-2 rounded-sm border border-red-200/50 bg-red-700 px-1 py-0.5 text-[0.42rem] font-black leading-none text-white">
        USGS
      </span>
    </div>
  );
}
