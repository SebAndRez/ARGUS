"use client";

import type { UseOperationalContextResult } from "@/hooks/useOperationalContext";
import type { OperationalResourceCard, ResourceOperationalState } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 7 (Operational Cards) + Fase 12
 * (modo operacional automático). Renderiza el paquete ya resuelto por
 * `useOperationalContext` — no hace fetch propio, no reimplementa scoring ni
 * estado (Fase 5/8 ya resueltos por el motor). Estilo consistente con
 * `CanonicalIncidentPanel.tsx`/`CriticalPoiInfoCard.tsx` (mismo lenguaje
 * visual oscuro del resto de ATLAS).
 */

const STATE_TONE: Record<ResourceOperationalState, string> = {
  operational: "border-emerald-400/40 text-emerald-300",
  limited: "border-amber-400/40 text-amber-300",
  saturated: "border-orange-400/40 text-orange-300",
  evacuated: "border-rose-400/50 text-rose-300",
  closed: "border-slate-500/40 text-slate-400",
  unconfirmed: "border-slate-500/40 text-slate-400",
  out_of_service: "border-rose-400/50 text-rose-300",
};

function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return "—";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(1)} km`;
}

function ResourceCardRow({ card }: { card: OperationalResourceCard }) {
  return (
    <li className="border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-cyan-300">{card.categoryLabel}</p>
          <p className="truncate text-xs font-semibold text-white">{card.name}</p>
        </div>
        <span className={`shrink-0 border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${STATE_TONE[card.state]}`}>
          {card.stateLabel}
        </span>
      </div>
      <p className="mt-1 text-[0.65rem] text-slate-500">
        {formatDistance(card.distanceKm)}
        {card.priority ? ` · ${card.priority}` : ""}
        {card.atRisk ? " · Dentro del área de impacto" : ""}
      </p>
      {card.detail ? <p className="mt-1 text-[0.6rem] text-amber-400/80">{card.detail}</p> : null}
    </li>
  );
}

export interface OperationalContextPanelProps {
  result: UseOperationalContextResult | null;
}

export default function OperationalContextPanel({ result }: OperationalContextPanelProps) {
  if (!result || result.state === "not_activated") return null;

  return (
    <section className="flex h-full flex-col border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Contexto operacional</h2>
        {result.state === "available" ? (
          <span className="text-[0.6rem] text-slate-500">{result.data.cards.length} recurso(s)</span>
        ) : null}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {result.state === "loading" && <p className="text-xs text-slate-500">Resolviendo contexto operacional…</p>}
        {result.state === "unavailable" && (
          <p className="text-xs text-rose-300">Contexto operacional no disponible en este momento.</p>
        )}

        {result.state === "available" && (
          <>
            <div className="border border-white/10 bg-white/[0.02] p-2 text-[0.65rem] text-slate-400">
              <p>
                Radio: {result.data.impactArea.radiusKm} km · Fase:{" "}
                {
                  {
                    early_warning: "Alerta temprana",
                    active_response: "Respuesta activa",
                    stabilization: "Estabilización",
                    recovery: "Recuperación",
                  }[result.data.responsePhase]
                }
              </p>
              {result.data.impactArea.commune ? (
                <p className="mt-0.5">
                  {result.data.impactArea.commune}
                  {result.data.impactArea.province ? `, ${result.data.impactArea.province}` : ""}
                  {result.data.impactArea.region ? `, ${result.data.impactArea.region}` : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-slate-600">Sin geometría administrativa resuelta — solo buffer circular.</p>
              )}
            </div>

            {result.data.cards.length === 0 ? (
              <p className="text-xs text-slate-500">Sin recursos relevantes encontrados en el área.</p>
            ) : (
              <ul className="space-y-1.5">
                {result.data.cards.map((card) => (
                  <ResourceCardRow key={card.id} card={card} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
