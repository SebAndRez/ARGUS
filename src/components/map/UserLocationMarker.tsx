export default function UserLocationMarker() {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-cyan-400/20 shadow-[0_0_22px_rgba(45,212,191,0.35)]" />
      <span className="absolute inset-3 rounded-full border border-cyan-300/80" />
      <span className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-slate-950">
        Mi
      </span>
    </div>
  );
}
