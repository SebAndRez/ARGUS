import type { OraculoEvidence } from "@/modules/oraculo/types";
import { formatOraculoTimestamp } from "@/modules/oraculo/utils";

interface Props {
  evidence: OraculoEvidence | null;
  allEvidence: OraculoEvidence[];
}

/**
 * Línea de tiempo de evidencia relacionada al mismo evento/reporte que la
 * evidencia seleccionada. No decide nada — solo ordena y explica la
 * secuencia de trazabilidad.
 */
export default function OraculoEventTracePanel({ evidence, allEvidence }: Props) {
  if (!evidence) {
    return (
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">
          Trazabilidad de evento
        </h2>
        <p className="mt-2 text-xs text-slate-500">Selecciona una evidencia para ver su línea de tiempo.</p>
      </section>
    );
  }

  const eventKey = evidence.relatedEventId ?? evidence.relatedReportId ?? evidence.id;
  const related = allEvidence
    .filter((item) => (item.relatedEventId ?? item.relatedReportId ?? item.id) === eventKey)
    .sort((a, b) => new Date(a.observedAt ?? a.collectedAt).getTime() - new Date(b.observedAt ?? b.collectedAt).getTime());

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">Trazabilidad de evento</h2>
      <ol className="mt-2 space-y-2 border-l border-white/10 pl-3">
        {related.map((item) => (
          <li key={item.id} className="relative text-xs text-slate-300">
            <span className="absolute -left-[1.05rem] top-1 h-1.5 w-1.5 rounded-full bg-violet-400" />
            <span className="font-mono text-[0.65rem] text-violet-300">
              {formatOraculoTimestamp(item.observedAt ?? item.collectedAt)}
            </span>{" "}
            — {item.sourceName}: {item.title}
          </li>
        ))}
      </ol>
    </section>
  );
}
