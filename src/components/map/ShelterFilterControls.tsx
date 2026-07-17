"use client";

import type { ShelterMapFilterState } from "@/lib/criticalPoi/shelterMapFilters";
import type { ShelterStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

interface Props {
  value: ShelterMapFilterState;
  onChange: (value: ShelterMapFilterState) => void;
}

const statusOptions: Array<{ value: ShelterStatus; label: string }> = [
  { value: "available", label: "Disponible" },
  { value: "near_capacity", label: "Capacidad limitada" },
  { value: "full", label: "Lleno" },
  { value: "closed", label: "Cerrado" },
  { value: "unknown", label: "Sin confirmar" },
];

export default function ShelterFilterControls({ value, onChange }: Props) {
  const toggleStatus = (status: ShelterStatus) => {
    const nextStatuses = value.statuses.includes(status)
      ? value.statuses.filter((item) => item !== status)
      : [...value.statuses, status];
    onChange({ ...value, statuses: nextStatuses });
  };

  return (
    <div className="mt-3 border border-cyan-300/12 bg-cyan-400/[0.04] p-3">
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-cyan-200">
        Filtro de refugios
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {statusOptions.map((option) => {
          const active = value.statuses.length === 0 || value.statuses.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleStatus(option.value)}
              className={`min-h-8 border px-2 py-1.5 text-left text-[0.6rem] font-semibold transition ${
                active
                  ? "border-cyan-400/25 bg-cyan-500/10 text-slate-100"
                  : "border-white/8 bg-white/[0.02] text-slate-500"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <label className="mt-2 flex items-center justify-between gap-2 border border-white/8 bg-black/20 px-2 py-1.5 text-[0.6rem] text-slate-400">
        <span>Ocultar datos desactualizados</span>
        <input
          type="checkbox"
          checked={value.hideStale}
          onChange={(event) => onChange({ ...value, hideStale: event.target.checked })}
          className="h-3.5 w-3.5 accent-cyan-400"
        />
      </label>
    </div>
  );
}
