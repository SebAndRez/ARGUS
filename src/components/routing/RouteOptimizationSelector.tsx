"use client";

import type { RouteOptimizationMode } from "@/types/routing";

const options: Array<{ value: RouteOptimizationMode; label: string }> = [
  { value: "fastest", label: "Mas rapida" },
  { value: "shortest", label: "Mas corta" },
  { value: "safest", label: "Mas segura" },
  { value: "low_fuel_route", label: "Bajo consumo" },
  { value: "low_exposure_route", label: "Baja exposicion" },
  { value: "emergency_response", label: "Emergencia" },
  { value: "evacuation", label: "Evacuacion" },
];

export default function RouteOptimizationSelector({
  value,
  onChange,
}: {
  value: RouteOptimizationMode;
  onChange: (value: RouteOptimizationMode) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as RouteOptimizationMode)}
      className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
