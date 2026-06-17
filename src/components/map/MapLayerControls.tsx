"use client";

interface Props {
  layers: {
    reports: boolean;
    sos: boolean;
    alerts: boolean;
    critical: boolean;
    resolved: boolean;
    user: boolean;
  };
  onToggle: (key: keyof Props["layers"]) => void;
}

const labels: Record<keyof Props["layers"], string> = {
  reports: "Reportes",
  sos: "SOS",
  alerts: "Alertas",
  critical: "Críticos",
  resolved: "Resueltos",
  user: "Mi ubicación",
};

export default function MapLayerControls({ layers, onToggle }: Props) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/90 p-4 shadow-xl shadow-black/30 backdrop-blur-xl">
      <p className="mb-3 text-xs uppercase tracking-[0.24em] text-cyan-300/85">Capas</p>
      <div className="grid gap-3">
        {(Object.keys(layers) as Array<keyof Props["layers"]>).map((key) => (
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
            <span>{labels[key]}</span>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[0.7rem] font-semibold">
              {layers[key] ? "ON" : "OFF"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
