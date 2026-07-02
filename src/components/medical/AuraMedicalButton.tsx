"use client";

export default function AuraMedicalButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="argus-medical-button pointer-events-auto fixed z-[51] min-h-11 rounded-full border border-rose-300/30 bg-rose-500/92 px-4 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-xl shadow-rose-950/40 backdrop-blur-xl"
    >
      SOS Médico
    </button>
  );
}
