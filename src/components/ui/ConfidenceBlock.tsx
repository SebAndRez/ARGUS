import {
  CONFIDENCE_PRESENTATION,
  getConfidenceLevel,
  type InterfaceVariant,
} from "@/config/argusDesignSystem";

interface Props {
  score?: number | null;
  label?: string | null;
  sourceSummary?: string | null;
  lastUpdatedLabel?: string | null;
  whyItMatters?: string | null;
  variant?: InterfaceVariant;
  compact?: boolean;
}

export default function ConfidenceBlock({
  score,
  label,
  sourceSummary,
  lastUpdatedLabel,
  whyItMatters,
  variant = "citizen",
  compact = false,
}: Props) {
  const level = getConfidenceLevel(score, label);
  const presentation = CONFIDENCE_PRESENTATION[level];
  const normalizedScore =
    typeof score === "number" && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-[0.65rem] text-slate-400">
        <span className={`h-2 w-2 shrink-0 rounded-full ${presentation.indicatorClassName}`} aria-hidden="true" />
        <span className="shrink-0 font-semibold text-slate-200">Confianza {presentation.label}</span>
        {sourceSummary && <span className="truncate">{sourceSummary}</span>}
      </div>
    );
  }

  return (
    <section className="argus-calm-panel rounded-lg border border-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${presentation.indicatorClassName}`} aria-hidden="true" />
          <p className="text-xs font-semibold text-white">
            {variant === "citizen" ? "Confianza" : "Nivel de confianza"}: {presentation.label}
          </p>
        </div>
        {normalizedScore !== null && (
          <span className={`rounded-md border px-2 py-1 font-mono text-[0.65rem] font-bold ${presentation.className}`}>
            {normalizedScore}%
          </span>
        )}
      </div>

      {(sourceSummary || lastUpdatedLabel) && (
        <div className="mt-3 grid gap-1 text-xs text-slate-400">
          {sourceSummary && <p className="break-words">Fuente: {sourceSummary}</p>}
          {lastUpdatedLabel && <p>Actualizado: {lastUpdatedLabel}</p>}
        </div>
      )}

      {whyItMatters && (
        <div className="mt-3 border-t border-white/8 pt-3">
          <p className="text-[0.62rem] font-semibold uppercase text-slate-500">Por qué importa</p>
          <p className="mt-1.5 break-words text-sm leading-5 text-slate-200">{whyItMatters}</p>
        </div>
      )}
    </section>
  );
}
