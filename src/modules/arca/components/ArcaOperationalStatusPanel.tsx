import type { ArcaShelter } from "@/modules/arca/types";
import { evaluateArcaOperationalStatus } from "@/modules/arca/arcaAvailability";
import { arcaConfidenceLabel, arcaShelterStatusLabel, arcaShelterStatusTone } from "@/modules/arca/utils";

interface Props {
  shelter: ArcaShelter;
}

export default function ArcaOperationalStatusPanel({ shelter }: Props) {
  const evaluation = evaluateArcaOperationalStatus(shelter);

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-300">Estado operativo</h2>
      <div className={`mt-2 inline-flex border px-2.5 py-1 text-xs font-bold uppercase ${arcaShelterStatusTone[evaluation.status]}`}>
        {arcaShelterStatusLabel[evaluation.status]}
      </div>
      <p className="mt-2 text-xs text-slate-400">Puntaje de servicios: {evaluation.serviceScore}/100 · Confianza {arcaConfidenceLabel[evaluation.confidence]}</p>

      {evaluation.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-300">
          {evaluation.reasons.map((reason) => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
      )}
      {evaluation.warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-200">
          {evaluation.warnings.map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[0.62rem] leading-4 text-slate-500">
        Refugio activo con capacidad disponible estimada. Verifique instrucciones oficiales y estado actualizado antes de desplazarse.
      </p>
    </section>
  );
}
