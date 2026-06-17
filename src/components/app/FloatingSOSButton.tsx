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
      className={`fixed bottom-28 right-4 z-50 flex h-20 w-20 items-center justify-center rounded-full text-white shadow-[0_0_40px_rgba(255,67,67,0.35)] transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-red-400/80 ${
        disabled ? "bg-slate-700/90 cursor-not-allowed opacity-60" : "bg-red-500/95 hover:scale-105"
      }`}
      aria-label="SOS"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-red-500/20" />
      <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-base font-black tracking-[0.28em] text-white shadow-lg">
        SOS
      </span>
    </button>
  );
}
