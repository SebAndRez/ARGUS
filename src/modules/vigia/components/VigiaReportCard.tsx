import type { VigiaReport } from "@/modules/vigia/types";
import {
  formatVigiaLocation,
  formatVigiaRelativeTime,
  suggestModulesForVigiaReport,
  vigiaConfidenceLabel,
  vigiaReportTypeLabel,
  vigiaSeverityLabel,
  vigiaSeverityTone,
  vigiaStatusLabel,
} from "@/modules/vigia/utils";

interface Props {
  report: VigiaReport;
  onSelect?: (report: VigiaReport) => void;
  showSensitiveDetails?: boolean;
}

export default function VigiaReportCard({ report, onSelect, showSensitiveDetails }: Props) {
  const suggestions = suggestModulesForVigiaReport(report.type);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(report)}
      className="w-full border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-cyan-300/25 hover:bg-cyan-400/5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{report.title || vigiaReportTypeLabel[report.type]}</p>
        <span className={`shrink-0 border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${vigiaSeverityTone[report.severity]}`}>
          {vigiaSeverityLabel[report.severity]}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {vigiaReportTypeLabel[report.type]} · {formatVigiaLocation(report.location)}
      </p>
      <p className="mt-1 text-[0.65rem] text-slate-500">
        {vigiaStatusLabel[report.status]} · Confianza {vigiaConfidenceLabel[report.confidence]} ·{" "}
        {formatVigiaRelativeTime(report.updatedAt)}
      </p>
      <p className="mt-1 text-[0.62rem] text-slate-600">
        {report.evidence.length} evidencia(s)
        {showSensitiveDetails ? ` · Reportante: ${report.reporter.alias} (rep. ${report.reporter.reputationScore})` : ""}
      </p>
      {suggestions.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {suggestions.map((suggestion) => (
            <li key={suggestion} className="text-[0.6rem] text-cyan-300/80">
              → {suggestion}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
