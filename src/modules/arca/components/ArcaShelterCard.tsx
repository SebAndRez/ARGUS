import type { ArcaShelter } from "@/modules/arca/types";
import { calculateArcaCapacityStatus, getArcaAvailableCapacity } from "@/modules/arca/arcaCapacity";
import {
  arcaCapacityStatusLabel,
  arcaConfidenceLabel,
  arcaShelterStatusLabel,
  arcaShelterStatusTone,
  arcaShelterTypeLabel,
  formatArcaDistance,
} from "@/modules/arca/utils";

interface Props {
  shelter: ArcaShelter;
  userLocation?: { lat: number; lng: number };
  onSelect?: (shelter: ArcaShelter) => void;
  onPlanRoute?: (shelter: ArcaShelter) => void;
  canPlanRoute?: boolean;
}

const keyServiceLabels: { key: keyof ArcaShelter["services"]; label: string }[] = [
  { key: "water", label: "Agua" },
  { key: "food", label: "Comida" },
  { key: "bathrooms", label: "Baños" },
  { key: "medicalPoint", label: "Punto médico" },
];

export default function ArcaShelterCard({ shelter, userLocation, onSelect, onPlanRoute, canPlanRoute }: Props) {
  const capacityStatus = calculateArcaCapacityStatus(shelter);
  const available = getArcaAvailableCapacity(shelter);

  return (
    <div className="w-full border border-white/10 bg-white/[0.02] p-3">
      <button type="button" onClick={() => onSelect?.(shelter)} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-white">{shelter.name}</p>
          <span className={`shrink-0 border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${arcaShelterStatusTone[shelter.status]}`}>
            {arcaShelterStatusLabel[shelter.status]}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">{arcaShelterTypeLabel[shelter.type]}</p>
        <p className="mt-1 text-[0.65rem] text-slate-500">
          Capacidad {arcaCapacityStatusLabel[capacityStatus]}
          {available !== null ? ` · ${available} cupo(s) estimado(s)` : ""} · Confianza {arcaConfidenceLabel[shelter.confidence]}
        </p>
        <p className="mt-1 text-[0.65rem] text-slate-500">{formatArcaDistance(shelter.location, userLocation)}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {keyServiceLabels
            .filter((service) => shelter.services[service.key] === "available")
            .map((service) => (
              <span key={service.key} className="border border-white/10 px-1.5 py-0.5 text-[0.55rem] uppercase text-slate-400">
                {service.label}
              </span>
            ))}
        </div>
      </button>
      {canPlanRoute && (
        <button
          type="button"
          onClick={() => onPlanRoute?.(shelter)}
          className="mt-2 w-full border border-teal-300/30 bg-teal-400/10 px-3 py-1.5 text-[0.6rem] font-bold uppercase text-teal-100"
        >
          Ruta con HERMES
        </button>
      )}
    </div>
  );
}
