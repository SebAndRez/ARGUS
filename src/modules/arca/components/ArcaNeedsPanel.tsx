import type { ArcaShelter, ArcaShelterNeed } from "@/modules/arca/types";

const priorityTone: Record<ArcaShelterNeed["priority"], string> = {
  critical: "border-red-400/40 bg-red-500/12 text-red-100",
  high: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  low: "border-white/15 bg-white/[0.03] text-slate-300",
};

const needTypeLabel: Record<ArcaShelterNeed["type"], string> = {
  water: "Agua",
  food: "Comida",
  medicine: "Medicamentos",
  blankets: "Frazadas",
  fuel: "Combustible",
  electricity: "Energía",
  sanitation: "Sanitarios",
  medical_staff: "Personal médico",
  security: "Seguridad",
  transport: "Transporte",
  volunteers: "Voluntarios",
  pet_supplies: "Insumos para mascotas",
  other: "Otro",
};

interface Props {
  shelters: ArcaShelter[];
}

/**
 * Panel de necesidades, visible solo para institución/logística/emergency
 * responder/admin/superadmin. No implementa inventario completo — eso
 * corresponde a NEXUS.
 */
export default function ArcaNeedsPanel({ shelters }: Props) {
  const openNeeds = shelters.flatMap((shelter) =>
    shelter.needs
      .filter((need) => need.status === "open" || need.status === "partially_fulfilled")
      .map((need) => ({ shelter, need }))
  );

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-300">Necesidades</h2>
        <span className="text-[0.6rem] text-slate-500">{openNeeds.length} abiertas</span>
      </header>
      {openNeeds.length === 0 ? (
        <p className="text-xs text-slate-500">Sin necesidades abiertas registradas.</p>
      ) : (
        <ul className="space-y-2">
          {openNeeds.map(({ shelter, need }) => (
            <li key={need.id} className={`border p-2.5 ${priorityTone[need.priority]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase">{needTypeLabel[need.type]}</span>
                <span className="text-[0.55rem] font-bold uppercase opacity-80">{need.priority}</span>
              </div>
              <p className="mt-1 text-[0.65rem] opacity-90">{need.description}</p>
              <p className="mt-1 text-[0.6rem] opacity-70">
                {shelter.name}
                {need.quantityNeeded ? ` · ${need.quantityNeeded} ${need.unit ?? ""}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
