import type { ArcaShelter } from "@/modules/arca/types";
import ArcaShelterCard from "@/modules/arca/components/ArcaShelterCard";

interface Props {
  shelters: ArcaShelter[];
  userLocation?: { lat: number; lng: number };
  onSelect?: (shelter: ArcaShelter) => void;
  onPlanRoute?: (shelter: ArcaShelter) => void;
  canPlanRoute?: boolean;
}

export default function ArcaShelterList({ shelters, userLocation, onSelect, onPlanRoute, canPlanRoute }: Props) {
  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-300">Refugios</h2>
        <span className="text-[0.6rem] text-slate-500">{shelters.length} registrados</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {shelters.length === 0 && <p className="text-xs text-slate-500">Sin refugios registrados.</p>}
        {shelters.map((shelter) => (
          <ArcaShelterCard
            key={shelter.id}
            shelter={shelter}
            userLocation={userLocation}
            onSelect={onSelect}
            onPlanRoute={onPlanRoute}
            canPlanRoute={canPlanRoute}
          />
        ))}
      </div>
    </section>
  );
}
