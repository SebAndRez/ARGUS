"use client";

interface FloatingReportButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export default function FloatingReportButton({ onClick, disabled }: FloatingReportButtonProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`argus-mobile-report fixed z-50 flex h-14 min-w-36 items-center gap-3 rounded-full border px-3 pr-5 text-white backdrop-blur-xl transition duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-300/80 focus:ring-offset-2 focus:ring-offset-slate-950 ${
        disabled
          ? "cursor-not-allowed border-slate-500/40 bg-slate-800/95 opacity-60 shadow-lg shadow-black/30"
          : "border-cyan-300/35 bg-slate-950/95 shadow-[0_0_28px_rgba(34,211,238,0.22)] hover:border-cyan-200/65 hover:bg-cyan-950/95"
      }`}
      aria-label={disabled ? "Reportes no disponibles para esta cuenta" : "Reportar incidente"}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-2xl font-light leading-none ${
          disabled ? "border-slate-500/40 bg-slate-700/70" : "border-cyan-300/35 bg-cyan-400/15 text-cyan-200"
        }`}
      >
        +
      </span>
      <span className="flex flex-col items-start">
        <span className="text-sm font-bold leading-none">Reportar</span>
        <span className="mt-1 text-[0.6rem] font-semibold uppercase leading-none text-slate-400">Incidente</span>
      </span>
    </button>
  );
}
