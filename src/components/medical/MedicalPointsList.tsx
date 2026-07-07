/**
 * @deprecated Componente legacy, no usado en ningun lado del codigo.
 * Reemplazado por `@/components/aura/AuraMedicalPointsList` (clickeable,
 * unificado con AURA). Se conserva por decision explicita del usuario.
 */
type LegacyMedicalPoint = {
  id: string;
  name: string;
  type: string;
  status: string;
  capabilities: string[];
  distanceKm?: number;
};

export default function MedicalPointsList({
  points,
}: {
  points: LegacyMedicalPoint[];
}) {
  return (
    <section className="grid gap-2">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-slate-500">
        Puntos medicos cercanos demo
      </p>
      {points.slice(0, 4).map((point) => (
        <article
          key={point.id}
          className="rounded border border-white/10 bg-slate-900/65 p-3 text-xs"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-white">{point.name}</p>
              <p className="mt-1 text-slate-500">{point.type}</p>
            </div>
            <span className="rounded-full border border-cyan-300/15 bg-cyan-400/8 px-2 py-1 text-[0.58rem] font-bold uppercase text-cyan-100">
              {point.distanceKm ? `${point.distanceKm.toFixed(1)} km` : point.status}
            </span>
          </div>
          <p className="mt-2 text-slate-400">
            {point.capabilities.slice(0, 3).join(" / ")}
          </p>
        </article>
      ))}
    </section>
  );
}
