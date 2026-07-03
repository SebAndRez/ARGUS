"use client";

export default function NotificationEmptyState() {
  return (
    <div className="border border-white/10 bg-slate-900/50 p-5 text-center">
      <p className="text-sm font-semibold text-slate-200">Sin alertas para este filtro.</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        ARGUS mostrara eventos reales, fuentes abiertas, reportes ciudadanos y estimaciones propias cuando existan datos compatibles.
      </p>
    </div>
  );
}
