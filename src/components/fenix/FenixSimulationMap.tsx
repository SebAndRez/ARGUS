import type { FenixSimulationResult } from "@/types/fenixSimulation";

export default function FenixSimulationMap({ result }: { result: FenixSimulationResult }) {
  const zones = result.affectedZones;
  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/85 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Mapa Fénix</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Zona afectada estimada</h3>
        </div>
        <span className="rounded border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[0.58rem] font-bold uppercase text-amber-100">
          DEMO / Estimación ARGUS
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded border border-white/10 bg-slate-900">
        <svg viewBox="0 0 520 300" role="img" aria-label="Mapa esquemático de simulación Fénix" className="h-72 w-full">
          <rect width="520" height="300" fill="#06111f" />
          <path d="M30 230 C130 170 210 240 310 170 S460 160 500 80" fill="none" stroke="#155e75" strokeWidth="16" opacity="0.35" />
          <path d="M20 115 C120 100 190 140 260 112 S390 60 500 105" fill="none" stroke="#475569" strokeWidth="4" strokeDasharray="8 8" opacity="0.75" />
          <path d="M70 260 L460 40" stroke="#334155" strokeWidth="3" opacity="0.8" />
          {zones.map((zone, index) => (
            <circle
              key={zone.id}
              cx={170 + index * 58}
              cy={180 - index * 26}
              r={Math.min(92, 20 + zone.radiusKm * 4)}
              fill={index === 0 ? "#f97316" : "#ef4444"}
              fillOpacity={0.12 + index * 0.03}
              stroke={index === 0 ? "#fdba74" : "#fca5a5"}
              strokeWidth="2"
            />
          ))}
          <circle cx="170" cy="180" r="7" fill="#22d3ee" />
          <line x1="170" y1="180" x2="410" y2="72" stroke="#facc15" strokeWidth="3" markerEnd="url(#arrow)" />
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#facc15" />
            </marker>
          </defs>
          <text x="28" y="34" fill="#bae6fd" fontSize="14" fontWeight="700">Coordenadas analizadas</text>
          <text x="28" y="54" fill="#94a3b8" fontSize="12">
            {result.input.initialLocation.latitude.toFixed(4)}, {result.input.initialLocation.longitude.toFixed(4)}
          </text>
        </svg>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        Visualización esquemática. No representa un polígono oficial ni instrucción de evacuación.
      </p>
    </section>
  );
}

