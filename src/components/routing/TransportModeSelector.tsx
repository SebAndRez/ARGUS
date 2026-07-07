"use client";

import { ROUTING_MODE_LABELS, type RoutingMode } from "@/lib/routing/routingService";

/** Selector generico de modo de transporte para navegacion GPS (AURA, mapa operacional, evacuacion, etc). */

const modes: RoutingMode[] = ["walking", "bike", "vehicle", "emergency_vehicle"];

const modeIcons: Record<RoutingMode, string> = {
  walking: "🚶",
  bike: "🚴",
  vehicle: "🚗",
  emergency_vehicle: "🚑",
};

export default function TransportModeSelector({
  value,
  onChange,
}: {
  value: RoutingMode;
  onChange: (mode: RoutingMode) => void;
}) {
  return (
    <div className="argus-transport-selector grid grid-cols-4 gap-1.5">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded border px-1 py-1.5 text-[0.58rem] font-bold uppercase transition ${
            value === mode
              ? "border-cyan-300/40 bg-cyan-400/14 text-cyan-100"
              : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-300/20"
          }`}
        >
          <span aria-hidden className="text-sm leading-none">
            {modeIcons[mode]}
          </span>
          {ROUTING_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
