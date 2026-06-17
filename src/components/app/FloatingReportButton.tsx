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
      className={`fixed bottom-12 right-4 z-50 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_0_24px_rgba(45,212,191,0.35)] transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-300/80 ${
        disabled ? "bg-slate-700/90 cursor-not-allowed opacity-60" : "bg-cyan-500/95 hover:scale-105"
      }`}
      aria-label="Reportar incidente"
    >
      <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-950/90 text-xl font-bold">+</span>
    </button>
  );
}