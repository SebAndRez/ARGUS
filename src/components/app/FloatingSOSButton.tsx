"use client";

interface FloatingSOSButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export default function FloatingSOSButton({ onClick, disabled }: FloatingSOSButtonProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`fixed bottom-32 right-4 z-50 flex h-20 w-20 items-center justify-center rounded-full border text-white transition duration-200 focus:outline-none focus:ring-2 focus:ring-red-300/90 focus:ring-offset-2 focus:ring-offset-slate-950 ${
        disabled
          ? "cursor-not-allowed border-slate-500/40 bg-slate-800/95 opacity-60 shadow-lg shadow-black/30"
          : "border-red-300/60 bg-red-600 shadow-[0_0_0_6px_rgba(239,68,68,0.12),0_0_42px_rgba(239,68,68,0.48)] hover:scale-105 hover:bg-red-500"
      }`}
      aria-label={disabled ? "SOS no disponible sin sesión" : "Solicitar ayuda de emergencia"}
    >
      {!disabled && <span className="absolute inset-1 animate-ping rounded-full border border-red-300/30" />}
      <span className="relative flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/15 bg-red-950/30 shadow-inner shadow-red-950/40">
        <span className="text-lg font-black leading-none">SOS</span>
        <span className="mt-1 text-[0.55rem] font-bold uppercase leading-none text-red-100">Emergencia</span>
      </span>
    </button>
  );
}
