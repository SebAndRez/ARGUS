"use client";

import { useEffect, useState } from "react";
import { planArgusRoute } from "@/lib/routing/argusRoutingEngine";
import RouteOptimizationSelector from "@/components/routing/RouteOptimizationSelector";
import RouteRiskBadge from "@/components/routing/RouteRiskBadge";
import RouteWarningsList from "@/components/routing/RouteWarningsList";
import VehicleProfileSelector from "@/components/routing/VehicleProfileSelector";
import type {
  ArgusRoutePlan,
  RouteOptimizationMode,
  VehicleProfile,
} from "@/types/routing";

export default function RoutePlannerPanel({
  origin,
}: {
  origin: [number, number];
}) {
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfile>("car");
  const [optimizationMode, setOptimizationMode] =
    useState<RouteOptimizationMode>("safest");
  const [plan, setPlan] = useState<ArgusRoutePlan | null>(null);

  useEffect(() => {
    planArgusRoute({
      origin,
      destination: [-33.4645, -70.6107],
      vehicleProfile,
      optimizationMode,
    }).then(setPlan);
  }, [optimizationMode, origin, vehicleProfile]);

  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/90 p-4">
      <header>
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-cyan-300">
          ARGUS NAV
        </p>
        <h2 className="mt-1 text-base font-semibold text-white">
          Rutas inteligentes de crisis
        </h2>
      </header>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <VehicleProfileSelector value={vehicleProfile} onChange={setVehicleProfile} />
        <RouteOptimizationSelector value={optimizationMode} onChange={setOptimizationMode} />
      </div>
      {plan && (
        <div className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">
              {plan.recommendedRoute.name}
            </span>
            <RouteRiskBadge risk={plan.riskLevel} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
            <span className="rounded border border-white/10 bg-white/[0.03] p-2">
              {plan.recommendedRoute.distanceKm.toFixed(1)} km
            </span>
            <span className="rounded border border-white/10 bg-white/[0.03] p-2">
              {plan.recommendedRoute.estimatedMinutes} min
            </span>
            <span className="rounded border border-white/10 bg-white/[0.03] p-2">
              Consumo relativo {100 - plan.efficiency.fuelScore}%
            </span>
            <span className="rounded border border-white/10 bg-white/[0.03] p-2">
              Evita {plan.recommendedRoute.turnPenalty.conflictTurnCount} giros conflictivos
            </span>
          </div>
          <p className="text-xs leading-5 text-slate-400">{plan.explanation}</p>
          <RouteWarningsList warnings={plan.recommendedRoute.warnings} />
        </div>
      )}
    </section>
  );
}
