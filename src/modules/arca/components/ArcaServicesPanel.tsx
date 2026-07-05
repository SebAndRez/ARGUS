import type { ArcaAccessibility, ArcaShelter, ArcaShelterServices } from "@/modules/arca/types";

const serviceLabels: Record<keyof ArcaShelterServices, string> = {
  water: "Agua",
  food: "Comida",
  electricity: "Energía",
  bathrooms: "Baños",
  showers: "Duchas",
  heating: "Calefacción",
  internet: "Internet",
  phoneCharging: "Carga de celular",
  medicalPoint: "Punto médico",
  psychologicalSupport: "Apoyo psicológico",
  security: "Seguridad",
  childFriendlyArea: "Área para niños",
  petFriendly: "Apto para mascotas",
};

const accessibilityLabels: Record<keyof ArcaAccessibility, string> = {
  wheelchairAccessible: "Silla de ruedas",
  reducedMobilitySupport: "Movilidad reducida",
  elderlySupport: "Adultos mayores",
  childSupport: "Niños",
  petSupport: "Mascotas",
  vehicleAccess: "Acceso vehicular",
  publicTransportAccess: "Transporte público",
};

function serviceTone(status: string | boolean) {
  if (status === "available" || status === true) return "border-emerald-300/25 bg-emerald-400/8 text-emerald-100";
  if (status === "limited") return "border-amber-300/25 bg-amber-400/8 text-amber-100";
  if (status === "unavailable" || status === false) return "border-white/10 bg-white/[0.02] text-slate-500";
  return "border-white/10 bg-white/[0.02] text-slate-500";
}

interface Props {
  shelter: ArcaShelter;
}

export default function ArcaServicesPanel({ shelter }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-300">Servicios</h2>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {(Object.keys(serviceLabels) as (keyof ArcaShelterServices)[]).map((key) => (
          <span key={key} className={`border px-2 py-1 text-[0.6rem] uppercase ${serviceTone(shelter.services[key])}`}>
            {serviceLabels[key]}
          </span>
        ))}
      </div>

      <h3 className="mt-3 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-cyan-300">Accesibilidad</h3>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {(Object.keys(accessibilityLabels) as (keyof ArcaAccessibility)[]).map((key) => (
          <span key={key} className={`border px-2 py-1 text-[0.6rem] uppercase ${serviceTone(shelter.accessibility[key])}`}>
            {accessibilityLabels[key]}
          </span>
        ))}
      </div>

      {shelter.restrictions && shelter.restrictions.length > 0 && (
        <div className="mt-3">
          <h3 className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-amber-300">Restricciones</h3>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
            {shelter.restrictions.map((restriction) => (
              <li key={restriction.id}>· {restriction.description}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
