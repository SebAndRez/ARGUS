import type { VigiaReport, VigiaReportStatus, VigiaValidationResult } from "@/modules/vigia/types";
import {
  formatVigiaLocation,
  formatVigiaRelativeTime,
  vigiaReportTypeLabel,
  vigiaSeverityLabel,
  vigiaSeverityTone,
} from "@/modules/vigia/utils";

interface Props {
  reports: VigiaReport[];
  evaluations?: Record<string, VigiaValidationResult>;
  onDecide: (reportId: string, status: VigiaReportStatus, action: string) => void;
  onSendTo: (reportId: string, target: "oraculo" | "talos" | "atlas") => void;
}

/**
 * Cola de validación visible solo para analyst/institution/emergency
 * responder/admin/superadmin. Las acciones son locales (mock/estado en
 * memoria) hasta que exista backend real para
 * `/api/vigia/reports/:id/validate` y `/api/vigia/reports/:id/escalate`.
 */
export default function VigiaValidationPanel({ reports, evaluations, onDecide, onSendTo }: Props) {
  const pending = reports.filter((report) =>
    ["pending_validation", "under_review", "submitted"].includes(report.status)
  );

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Cola de validación
        </h2>
        <span className="text-[0.6rem] text-slate-500">{pending.length} pendientes</span>
      </header>

      <div className="space-y-2">
        {pending.length === 0 && <p className="text-xs text-slate-500">Sin reportes pendientes de validar.</p>}
        {pending.map((report) => (
          <div key={report.id} className="border border-white/10 bg-white/[0.02] p-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-white">{report.title || vigiaReportTypeLabel[report.type]}</p>
              <span className={`shrink-0 border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${vigiaSeverityTone[report.severity]}`}>
                {vigiaSeverityLabel[report.severity]}
              </span>
            </div>
            <p className="mt-1 text-[0.65rem] text-slate-500">
              {formatVigiaLocation(report.location)} · {formatVigiaRelativeTime(report.createdAt)} ·{" "}
              {report.evidence.length} evidencia(s)
            </p>
            {evaluations?.[report.id] && (
              <p className="mt-1 text-[0.62rem] text-cyan-300/80">
                Score {evaluations[report.id].score} ·{" "}
                {evaluations[report.id].reasons[0] ?? "Sin señales adicionales."}
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onDecide(report.id, "confirmed", "CONFIRM")}
                className="border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-emerald-100"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => onDecide(report.id, "rejected", "REJECT")}
                className="border border-red-400/30 bg-red-500/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-red-100"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => onDecide(report.id, "duplicate", "MARK_DUPLICATE")}
                className="border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.6rem] font-bold uppercase text-slate-300"
              >
                Duplicado
              </button>
              <button
                type="button"
                onClick={() => onDecide(report.id, "escalated", "ESCALATE")}
                className="border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-amber-100"
              >
                Escalar a ATLAS
              </button>
              <button
                type="button"
                onClick={() => onSendTo(report.id, "oraculo")}
                className="border border-violet-300/30 bg-violet-400/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-violet-100"
              >
                Enviar a ORÁCULO
              </button>
              <button
                type="button"
                onClick={() => onSendTo(report.id, "talos")}
                className="border border-fuchsia-300/30 bg-fuchsia-400/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-fuchsia-100"
              >
                Enviar a TALOS
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
