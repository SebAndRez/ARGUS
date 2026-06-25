"use client";

import RiskAssessmentCard from "@/components/risk/RiskAssessmentCard";
import type { ArgusRiskAssessment } from "@/types/riskAssessment";

interface Props {
  assessments: ArgusRiskAssessment[];
  status: "idle" | "loading" | "loaded" | "error";
  errorMessage?: string | null;
  onRefresh: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function RiskAssessmentPanel({
  assessments,
  status,
  errorMessage,
  onRefresh,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
  return (
    <section className="argus-tactical-panel border bg-slate-950/94 p-3 shadow-2xl shadow-black/35 backdrop-blur-xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-cyan-300">
            Prediccion ARGUS
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Hipotesis con evidencia, no certeza automatica
          </p>
          <p className="mt-1 text-[0.6rem] leading-4 text-amber-100/75">
            Estimacion ARGUS: no reemplaza informacion oficial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-8 border border-cyan-300/25 bg-cyan-400/10 px-2 text-[0.58rem] font-bold uppercase text-cyan-100"
          >
            Actualizar
          </button>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="min-h-8 border border-white/10 bg-white/[0.03] px-2 text-[0.58rem] font-bold uppercase text-slate-300"
            >
              {collapsed ? "Abrir" : "Ocultar"}
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div className="mt-3 max-h-[52vh] overflow-y-auto pr-1">
          {status === "loading" && (
            <p className="text-sm text-cyan-100">Analizando fuentes externas...</p>
          )}
          {status === "error" && (
            <p className="text-sm leading-5 text-amber-200">
              Prediccion no disponible: {errorMessage ?? "error desconocido"}
            </p>
          )}
          {status === "loaded" && assessments.length === 0 && (
            <p className="text-sm leading-5 text-slate-400">
              No hay hipotesis activas con la evidencia actual.
            </p>
          )}
          <div className="grid gap-3">
            {assessments.slice(0, 3).map((assessment) => (
              <RiskAssessmentCard key={assessment.id} assessment={assessment} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
