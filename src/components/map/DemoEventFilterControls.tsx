"use client";

import type {
  DemoLifecycleFilter,
  DemoSeverityFilter,
  DemoTypeFilter,
} from "@/lib/demoEventFilters";

interface Props {
  severity: DemoSeverityFilter;
  type: DemoTypeFilter;
  lifecycle: DemoLifecycleFilter;
  onSeverityChange: (value: DemoSeverityFilter) => void;
  onTypeChange: (value: DemoTypeFilter) => void;
  onLifecycleChange: (value: DemoLifecycleFilter) => void;
  visibleCount: number;
  totalCount: number;
}

const selectClassName =
  "min-h-9 w-full border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-300/45";

export default function DemoEventFilterControls({
  severity,
  type,
  lifecycle,
  onSeverityChange,
  onTypeChange,
  onLifecycleChange,
  visibleCount,
  totalCount,
}: Props) {
  return (
    <div className="mt-3 border border-cyan-300/12 bg-cyan-400/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-cyan-200">
          Filtros demo
        </p>
        <span className="font-mono text-[0.6rem] text-slate-400">
          {visibleCount}/{totalCount}
        </span>
      </div>

      <div className="mt-2 grid gap-2">
        <label className="grid gap-1 text-[0.58rem] font-semibold uppercase text-slate-500">
          Severidad
          <select
            value={severity}
            onChange={(event) => onSeverityChange(event.target.value as DemoSeverityFilter)}
            className={selectClassName}
          >
            <option value="ALL">Todas</option>
            <option value="CRITICAL">Crítica</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Media</option>
            <option value="LOW">Baja</option>
          </select>
        </label>

        <label className="grid gap-1 text-[0.58rem] font-semibold uppercase text-slate-500">
          Tipo
          <select
            value={type}
            onChange={(event) => onTypeChange(event.target.value as DemoTypeFilter)}
            className={selectClassName}
          >
            <option value="ALL">Todos</option>
            <option value="REPORT">Reportes</option>
            <option value="ALERT">Alertas</option>
            <option value="SOS">SOS</option>
          </select>
        </label>

        <label className="grid gap-1 text-[0.58rem] font-semibold uppercase text-slate-500">
          Estado
          <select
            value={lifecycle}
            onChange={(event) => onLifecycleChange(event.target.value as DemoLifecycleFilter)}
            className={selectClassName}
          >
            <option value="ALL">Todos</option>
            <option value="new">Nueva</option>
            <option value="verifying">En verificación</option>
            <option value="confirmed">Confirmada</option>
            <option value="responding">En respuesta</option>
            <option value="resolved">Resuelta</option>
            <option value="expired">Expirada</option>
            <option value="dismissed">Descartada</option>
          </select>
        </label>
      </div>
    </div>
  );
}
