"use client";

import {
  ALERT_SEVERITY_PRESENTATION,
  CONFIDENCE_PRESENTATION,
  getDefaultConfidenceLevel,
  getDefaultSourceSummary,
} from "@/config/argusDesignSystem";
import {
  deriveConfidenceFromSignals,
  deriveRecommendedAction,
  getLifecycleStatus,
} from "@/lib/alertLifecycle";
import { getNearbyEvents } from "@/lib/demoEventFilters";
import AlertLifecycleBadge from "@/components/ui/AlertLifecycleBadge";
import ConfidenceBlock from "@/components/ui/ConfidenceBlock";
import RecommendedActionBlock from "@/components/ui/RecommendedActionBlock";
import type { CrisisEvent } from "@/types/crisis";

interface Props {
  events: CrisisEvent[];
  latitude: number;
  longitude: number;
  onSelect: (event: CrisisEvent) => void;
  maxItems?: number;
  demoVisibleCount?: number;
  demoTotalCount?: number;
}

function eventTypeLabel(type: CrisisEvent["type"]) {
  if (type === "SOS") return "SOS";
  if (type === "ALERT") return "Alerta";
  return "Reporte";
}

export default function NearbyEventsSheet({
  events,
  latitude,
  longitude,
  onSelect,
  maxItems = 20,
  demoVisibleCount,
  demoTotalCount,
}: Props) {
  const nearbyEvents = getNearbyEvents(events, latitude, longitude, maxItems);
  const hasDemoSummary =
    typeof demoVisibleCount === "number" && typeof demoTotalCount === "number";
  const displayedDemoCount = Math.min(maxItems, demoVisibleCount ?? 0);

  return (
    <aside className="argus-nearby-sheet pointer-events-auto fixed inset-x-0 bottom-0 z-40 mx-auto max-w-5xl overflow-hidden rounded-t-lg border border-white/10 bg-slate-950/92 px-4 pb-4 pt-3 backdrop-blur-xl shadow-[0_-18px_48px_rgba(0,0,0,0.42)] sm:px-6">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-600/70 sm:hidden" />

      <div className="mr-40 mb-3 flex min-h-7 items-center justify-between gap-3 2xl:mr-0">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase text-cyan-300/80">Perímetro cercano</p>
          <p className="mt-1 text-xs text-slate-400">Ordenado por distancia</p>
          {hasDemoSummary && (
            <p className="mt-1 text-[0.65rem] text-cyan-200/80">
              Mostrando {displayedDemoCount} de {demoTotalCount} reportes demo
              {demoVisibleCount !== demoTotalCount ? ` · ${demoVisibleCount} coinciden con filtros` : ""}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-md border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[0.65rem] font-semibold uppercase text-slate-300">
          {events.length} activos
        </span>
      </div>

      <div className="mr-40 overflow-hidden 2xl:mr-0">
        <div className="argus-nearby-sheet-scroll flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nearbyEvents.map(({ event, distanceKm }) => {
            const severity = ALERT_SEVERITY_PRESENTATION[event.severity];
            const formattedDistance =
              distanceKm < 1
                ? `${Math.round(distanceKm * 1000)} m`
                : `${distanceKm.toFixed(1)} km`;
            const confidence = deriveConfidenceFromSignals(event);
            const confidenceLabel =
              event.confidenceLabel ??
              CONFIDENCE_PRESENTATION[getDefaultConfidenceLevel({ type: event.type, status: event.status })].label;
            const sourceSummary = event.sourceSummary?.trim() || getDefaultSourceSummary(event.type);
            const recommendedAction = deriveRecommendedAction(event, "citizen");
            const lifecycleStatus = getLifecycleStatus(event);

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelect(event)}
                className="group relative min-h-40 min-w-full snap-start overflow-hidden rounded-lg border border-white/10 bg-slate-900/90 px-3.5 py-3 text-left transition hover:border-cyan-300/35 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-300/70 sm:min-w-[290px] sm:max-w-[320px]"
                aria-label={`Ver ${event.title}, ${formattedDistance}`}
              >
                <span className={`absolute inset-y-0 left-0 w-1 ${severity.accentClassName}`} />

                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-md border px-2 py-1 text-[0.6rem] font-bold uppercase ${severity.className}`}>
                    {eventTypeLabel(event.type)} · {severity.citizenLabel}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-semibold text-white">{formattedDistance}</span>
                </div>

                <p className="mt-2 truncate text-sm font-semibold text-white">{event.title}</p>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-slate-400">{event.category}</span>
                  <AlertLifecycleBadge status={lifecycleStatus} compact />
                </div>

                <div className="mt-2 border-t border-white/8 pt-2">
                  <ConfidenceBlock
                    score={confidence}
                    label={confidenceLabel}
                    sourceSummary={sourceSummary}
                    compact
                  />
                  <div className="mt-2">
                    <RecommendedActionBlock
                      action={recommendedAction}
                      severity={event.severity}
                      type={event.type}
                      status={event.status}
                      compact
                    />
                  </div>
                </div>
              </button>
            );
          })}

          {nearbyEvents.length === 0 && (
            <div className="flex min-h-40 min-w-full items-center rounded-lg border border-dashed border-white/10 bg-slate-900/60 px-4 text-sm text-slate-400">
              Sin eventos activos en el perímetro.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
