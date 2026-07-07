import type { MedicalPoint } from "@/types/medical";
import { estimateEtaMinutes } from "@/lib/medical/auraMedicalRouting";

const availabilityLabels: Record<MedicalPoint["availabilityStatus"], string> = {
  available: "Disponible",
  limited: "Limitada",
  unknown: "N/D",
  closed: "Cerrado",
};

const typeLabels: Record<MedicalPoint["type"], string> = {
  hospital: "Hospital",
  clinic: "Clinica",
  sapu: "SAPU",
  shelter_medical: "Refugio medico",
  temporary_medical_point: "Punto medico temporal",
};

interface Props {
  points: MedicalPoint[];
  selectedId?: string | null;
  recommendedId?: string | null;
  onSelect: (point: MedicalPoint) => void;
}

export default function AuraMedicalPointsList({ points, selectedId, recommendedId, onSelect }: Props) {
  return (
    <section className="grid gap-2">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-slate-500">
        Puntos medicos cercanos {points.some((point) => point.isDemo) ? "(demo)" : ""}
      </p>
      {points.slice(0, 5).map((point) => {
        const isSelected = point.id === selectedId;
        const isRecommended = point.id === recommendedId;
        return (
          <button
            key={point.id}
            type="button"
            onClick={() => onSelect(point)}
            className={`rounded border p-3 text-left text-xs transition ${
              isSelected
                ? "border-cyan-300/40 bg-cyan-400/10"
                : "border-white/10 bg-slate-900/65 hover:border-cyan-300/25"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-semibold text-white">{point.name}</p>
                  {isRecommended && (
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase text-emerald-100">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-slate-500">{typeLabels[point.type]}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full border border-cyan-300/15 bg-cyan-400/8 px-2 py-1 text-[0.58rem] font-bold uppercase text-cyan-100">
                  {point.distanceKm !== undefined ? `${point.distanceKm.toFixed(1)} km` : availabilityLabels[point.availabilityStatus]}
                </span>
                {point.distanceKm !== undefined && (
                  <span className="text-[0.55rem] uppercase text-slate-500">
                    ETA {estimateEtaMinutes(point.distanceKm, "vehicle")} min
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-slate-400">
              {point.capabilities.slice(0, 3).join(" / ") || availabilityLabels[point.availabilityStatus]}
            </p>
          </button>
        );
      })}
    </section>
  );
}
