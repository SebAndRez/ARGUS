"use client";

import { useEffect, useState } from "react";

/**
 * ARGUS Prompt 17 §12, §18 — Source Health visible solo para operadores
 * autorizados dentro de VIGÍA, y siempre separado de la lista de amenazas
 * (nunca se cuenta un adaptador degradado como un incidente). Reutiliza
 * `/api/vigia/source-health/full` (Prompt 16, ya protegido server-side por
 * `requireOperator()`) — este componente no reimplementa Source Health, solo
 * lo resume.
 */

type OperatorSourceHealthEntry = { sourceId: string; operationalStatus: string };

export default function VigiaSourceHealthMiniPanel({ visible }: { visible: boolean }) {
  const [entries, setEntries] = useState<OperatorSourceHealthEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/vigia/source-health/full", { cache: "no-store" });
        if (!response.ok) throw new Error("source health request failed");
        const body = await response.json();
        if (!cancelled) setEntries(body.sources ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  const operational = entries?.filter((e) => e.operationalStatus === "operational").length ?? 0;
  const degraded = entries?.filter((e) => e.operationalStatus === "degraded" || e.operationalStatus === "broken").length ?? 0;

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Source Health (operador)</h2>
      {failed && <p className="mt-2 text-xs text-rose-300">No fue posible cargar el estado de las fuentes.</p>}
      {!failed && !entries && <p className="mt-2 text-xs text-slate-500">Cargando…</p>}
      {entries && (
        <p className="mt-2 text-xs text-slate-300">
          {operational} fuente(s) operativas · {degraded} degradada(s)/rota(s) de {entries.length} totales.
        </p>
      )}
    </section>
  );
}
