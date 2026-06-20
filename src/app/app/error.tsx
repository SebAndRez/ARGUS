"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ARGUS app route error", error);
  }, [error]);

  return (
    <main className="argus-app-shell flex items-center justify-center bg-slate-950 p-5 text-white">
      <section className="w-full max-w-md border border-red-300/25 bg-slate-900/95 p-6 shadow-2xl shadow-black/50">
        <p className="text-xs font-semibold uppercase text-red-300">
          ARGUS GRID
        </p>
        <h1 className="mt-3 text-xl font-semibold">
          ARGUS no pudo cargar la interfaz
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Recargue o revise compatibilidad del navegador.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 min-h-11 w-full border border-cyan-300/30 bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950"
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
