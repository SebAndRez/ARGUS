"use client";

import type { SensorSafetyCheckIn, SensorSafetyResponse } from "@/types/sensorSafety";

const responses: Array<{ label: string; value: SensorSafetyResponse }> = [
  { label: "Estoy bien", value: "I_AM_SAFE" },
  { label: "Necesito ayuda", value: "NEED_HELP" },
  { label: "Estoy herido", value: "INJURED" },
  { label: "Estoy atrapado", value: "TRAPPED" },
  { label: "No puedo moverme", value: "CANNOT_MOVE" },
  { label: "Falsa alarma", value: "FALSE_ALARM" },
];

export default function SafetyCheckBlockingModal({
  checkIn,
  eventLabel,
  onRespond,
  onClose,
}: {
  checkIn: SensorSafetyCheckIn | null;
  eventLabel: string;
  onRespond: (response: SensorSafetyResponse) => void;
  onClose: () => void;
}) {
  if (!checkIn) return null;
  return (
    <div className="fixed inset-0 z-[76] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <section className="w-full max-w-md border border-orange-300/25 bg-slate-950 p-4 shadow-2xl shadow-black/50">
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-orange-300">
          Safety Check
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">¿Estas bien?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          ARGUS detecto un posible evento critico: {eventLabel}. Es una
          deteccion preliminar, pendiente de confirmacion.
        </p>
        <p className="mt-2 text-xs text-slate-500">Vence: {checkIn.deadlineAt}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {responses.map((response) => (
            <button
              key={response.value}
              type="button"
              onClick={() => onRespond(response.value)}
              className="min-h-11 border border-white/10 bg-white/[0.04] px-3 text-sm font-bold uppercase text-slate-100"
            >
              {response.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-10 w-full border border-white/10 bg-slate-900 px-3 text-xs font-bold uppercase text-slate-400"
        >
          Cerrar demo
        </button>
      </section>
    </div>
  );
}
