import type { ArgusHazardDomain } from "@/types/knowledgeIntake";

export type KnowledgeDomainFilterValue =
  | "all"
  | "fires"
  | "traffic"
  | "earthquakes"
  | "tsunamis"
  | "chemical"
  | "nuclear"
  | "industrial"
  | "extreme_weather"
  | "infrastructure"
  | "public_health"
  | "conflict"
  | "chile"
  | "global";

export const domainFilterMap: Record<KnowledgeDomainFilterValue, ArgusHazardDomain[]> = {
  all: [],
  fires: ["wildfire", "urban_fire", "industrial_fire"],
  traffic: ["road_accident", "transport_accident", "rail_accident", "aviation_accident", "maritime_accident"],
  earthquakes: ["earthquake"],
  tsunamis: ["tsunami"],
  chemical: ["chemical_accident"],
  nuclear: ["nuclear_radiological"],
  industrial: ["industrial_accident", "chemical_accident", "explosion", "mining_accident"],
  extreme_weather: ["storm", "hurricane", "tornado", "heatwave", "coldwave", "drought", "flood"],
  infrastructure: ["dam_failure", "bridge_collapse", "building_collapse", "power_grid_failure", "telecom_failure", "water_system_failure"],
  public_health: ["public_health", "biological_hazard"],
  conflict: ["conflict_zone", "civil_unrest", "humanitarian_crisis"],
  chile: [],
  global: [],
};

const filters: Array<{ value: KnowledgeDomainFilterValue; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "fires", label: "Incendios" },
  { value: "traffic", label: "Transito" },
  { value: "earthquakes", label: "Terremotos" },
  { value: "tsunamis", label: "Tsunamis" },
  { value: "chemical", label: "Quimico" },
  { value: "nuclear", label: "Nuclear" },
  { value: "industrial", label: "Industrial" },
  { value: "extreme_weather", label: "Clima extremo" },
  { value: "infrastructure", label: "Infraestructura" },
  { value: "public_health", label: "Salud publica" },
  { value: "conflict", label: "Conflicto/crisis" },
  { value: "chile", label: "Chile" },
  { value: "global", label: "Global" },
];

export default function KnowledgeDomainFilter({
  value,
  onChange,
}: {
  value: KnowledgeDomainFilterValue;
  onChange: (value: KnowledgeDomainFilterValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <button
          key={filter.value}
          type="button"
          onClick={() => onChange(filter.value)}
          className={`rounded border px-3 py-2 text-xs font-semibold transition ${
            value === filter.value
              ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-50"
              : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-300/30 hover:text-white"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
