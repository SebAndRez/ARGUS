"use client";

import type { SafetyCheck } from "@/types/mobileSafety";

interface Props {
  check: SafetyCheck | null;
  onSafe: () => void;
  onNeedHelp: () => void;
  onClose: () => void;
}

export default function SafetyCheckBlockingModal({
  check,
  onSafe,
  onNeedHelp,
  onClose,
}: Props) {
  if (!check) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <section className="w-full max-w-sm border border-cyan-300/25 bg-slate-950 p-4 shadow-2xl shadow-black/50">
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-cyan-300">
          Safety Check
        </p>
        <h2 className="mt-2 text-lg font-semibold text-white">
          Confirma tu estado
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          ARGUS detecto una posible sacudida y solicita una respuesta manual.
          Esto es una simulacion Web/PWA; no activa llamadas ni notificaciones
          reales.
        </p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={onSafe}
            className="min-h-11 border border-emerald-300/30 bg-emerald-400/15 px-3 text-sm font-bold uppercase text-emerald-100"
          >
            Estoy bien
          </button>
          <button
            type="button"
            onClick={onNeedHelp}
            className="min-h-11 border border-amber-300/30 bg-amber-400/15 px-3 text-sm font-bold uppercase text-amber-100"
          >
            Necesito ayuda
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 border border-white/10 bg-white/[0.03] px-3 text-xs font-bold uppercase text-slate-300"
          >
            Cerrar demo
          </button>
        </div>
      </section>
    </div>
  );
}
