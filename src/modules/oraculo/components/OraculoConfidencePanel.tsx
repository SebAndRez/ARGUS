import type { OraculoEvidence, OraculoScoringResult } from "@/modules/oraculo/types";

interface Props {
  evidence: OraculoEvidence | null;
  result: OraculoScoringResult | null;
  canVerify?: boolean;
  canReject?: boolean;
  onVerify?: (evidenceId: string) => void;
  onReject?: (evidenceId: string) => void;
}

/**
 * Explica por qué una evidencia tiene cierto score, en vez de afirmar
 * "esto es verdad". Principio clave de ORÁCULO: trazabilidad sobre certeza
 * absoluta.
 */
export default function OraculoConfidencePanel({ evidence, result, canVerify, canReject, onVerify, onReject }: Props) {
  if (!evidence || !result) {
    return (
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">Panel de confianza</h2>
        <p className="mt-2 text-xs text-slate-500">Selecciona una evidencia del feed para ver su explicación de score.</p>
      </section>
    );
  }

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300">Panel de confianza</h2>
      <p className="mt-2 text-sm font-semibold text-white">{evidence.title}</p>
      <p className="mt-1 text-2xl font-bold text-white">{result.score}/100</p>

      {result.reasons.length > 0 && (
        <div className="mt-2">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-emerald-300">Razones</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
            {result.reasons.map((reason) => (
              <li key={reason}>· {reason}</li>
            ))}
          </ul>
        </div>
      )}

      {result.penalties.length > 0 && (
        <div className="mt-2">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-amber-300">Penalizaciones</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
            {result.penalties.map((penalty) => (
              <li key={penalty}>· {penalty}</li>
            ))}
          </ul>
        </div>
      )}

      {result.requiresHumanReview && (
        <p className="mt-3 border border-amber-300/25 bg-amber-400/8 px-2.5 py-1.5 text-[0.65rem] text-amber-100">
          Requiere revisión humana antes de escalar.
        </p>
      )}

      {(canVerify || canReject) && (
        <div className="mt-3 flex gap-2">
          {canVerify && (
            <button
              type="button"
              onClick={() => onVerify?.(evidence.id)}
              className="border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-[0.62rem] font-bold uppercase text-emerald-100"
            >
              Verificar evidencia
            </button>
          )}
          {canReject && (
            <button
              type="button"
              onClick={() => onReject?.(evidence.id)}
              className="border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[0.62rem] font-bold uppercase text-red-100"
            >
              Rechazar evidencia
            </button>
          )}
        </div>
      )}
    </section>
  );
}
