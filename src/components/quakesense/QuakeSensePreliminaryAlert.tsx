import type { QuakeSenseCluster, QuakeSenseDetection } from "@/types/quakesense";

export default function QuakeSensePreliminaryAlert({
  detection,
  cluster,
  onClose,
}: {
  detection?: QuakeSenseDetection | null;
  cluster?: QuakeSenseCluster | null;
  onClose?: () => void;
}) {
  if (!detection && !cluster) return null;

  return (
    <section className="rounded-lg border border-amber-300/25 bg-slate-950/96 p-4 text-amber-100 shadow-2xl shadow-black/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-amber-300">
            Alerta preliminar
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Posible sacudida detectada
          </h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-300"
          >
            Cerrar
          </button>
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-300">
        Estimacion ARGUS, no exacta. Pendiente de confirmacion oficial.
      </p>
      <p className="mt-2 rounded border border-amber-300/15 bg-amber-400/8 p-2 text-xs leading-5">
        Agachate, cubrete y afirmate si sientes movimiento. No reemplaza CSN,
        SENAPRED, SHOA, USGS ni fuentes oficiales.
      </p>
    </section>
  );
}
