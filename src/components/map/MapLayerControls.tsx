"use client";

interface LayerState {
  reports: boolean;
  sos: boolean;
  alerts: boolean;
  critical: boolean;
  resolved: boolean;
  user: boolean;
  visualSources?: boolean;
}

interface Props<TLayers extends LayerState> {
  layers: TLayers;
  onToggle: (key: keyof TLayers) => void;
}

const labels: Record<keyof LayerState, string> = {
  reports: "Reportes",
  sos: "SOS",
  alerts: "Alertas",
  critical: "Críticos",
  resolved: "Resueltos",
  user: "Mi ubicación",
  visualSources: "Fuentes visuales",
};

export default function MapLayerControls<TLayers extends LayerState>({ layers, onToggle }: Props<TLayers>) {
  return (
    <div className="argus-tactical-panel max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-3xl border bg-slate-950/95 p-4 shadow-2xl shadow-black/35 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.28em] text-cyan-300/80">CAPAS / LAYERS</p>
          <p className="mt-1 text-sm font-semibold text-white">Control táctico</p>
        </div>
      </div>
      <div className="grid gap-3">
        {(Object.keys(layers) as Array<Extract<keyof TLayers, string>>).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-sm transition ${
              layers[key]
                ? "border-cyan-400/25 bg-cyan-500/10 text-slate-50"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <span>{labels[key as keyof LayerState]}</span>
            <span className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full border border-white/15 bg-slate-950/70 px-2 text-[0.65rem] font-semibold">
              {layers[key] ? "ON" : "OFF"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
