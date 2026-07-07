"use client";

import { useEffect, useState } from "react";
import type { MedicalPoint } from "@/types/medical";
import type { ConflictZone } from "@/types/conflictZone";
import type { RiskProjection } from "@/types/weatherRisk";
import {
  AURA_TRANSPORT_LABELS,
  buildAuraDirectRoute,
  buildAuraSafeRoute,
  getEtaByTransportMode,
  type AuraMedicalRoute,
  type AuraMedicalRouteKind,
  type AuraTransportMode,
} from "@/lib/medical/auraMedicalRouting";

const transportOrder: AuraTransportMode[] = ["walking", "bike", "vehicle", "emergency_vehicle"];

const typeLabels: Record<MedicalPoint["type"], string> = {
  hospital: "Hospital",
  clinic: "Clinica / Atencion primaria",
  shelter_medical: "Refugio con asistencia medica",
  temporary_medical_point: "Punto medico temporal",
};

const availabilityLabels: Record<MedicalPoint["availabilityStatus"], string> = {
  available: "Disponible",
  limited: "Capacidad limitada",
  unknown: "Disponibilidad no confirmada",
  closed: "Cerrado",
};

interface Props {
  point: MedicalPoint;
  origin: { lat: number; lng: number };
  riskProjections?: RiskProjection[];
  conflictZones?: ConflictZone[];
  onRouteChange?: (route: AuraMedicalRoute | null) => void;
}

export default function AuraMedicalRoutePanel({
  point,
  origin,
  riskProjections = [],
  conflictZones = [],
  onRouteChange,
}: Props) {
  const [routeKind, setRouteKind] = useState<AuraMedicalRouteKind>("direct");
  const [route, setRoute] = useState<AuraMedicalRoute | null>(null);
  const [loadingSafe, setLoadingSafe] = useState(false);

  useEffect(() => {
    const direct = buildAuraDirectRoute(origin, { lat: point.lat, lng: point.lng });
    setRoute(direct);
    setRouteKind("direct");
    onRouteChange?.(direct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point.id, origin.lat, origin.lng]);

  const selectDirect = () => {
    const direct = buildAuraDirectRoute(origin, { lat: point.lat, lng: point.lng });
    setRoute(direct);
    setRouteKind("direct");
    onRouteChange?.(direct);
  };

  const selectSafe = async () => {
    setLoadingSafe(true);
    try {
      const safe = await buildAuraSafeRoute(
        origin,
        { lat: point.lat, lng: point.lng },
        "vehicle",
        { riskProjections, conflictZones }
      );
      setRoute(safe);
      setRouteKind("safe");
      onRouteChange?.(safe);
    } finally {
      setLoadingSafe(false);
    }
  };

  const distanceKm = route?.distanceKm ?? 0;
  const etaByMode = getEtaByTransportMode(distanceKm);

  const openExternalRoute = () => {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${point.lat},${point.lng}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="argus-aura-route-panel mt-2 grid gap-3 rounded border border-cyan-300/20 bg-slate-900/70 p-3 text-xs">
      <header className="grid gap-1">
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Ruta medica {routeKind === "safe" ? "· mas segura (demo)" : "· mas directa (demo)"}
        </p>
        <h3 className="text-sm font-semibold text-white">{point.name}</h3>
        <p className="text-slate-400">
          {typeLabels[point.type]} · {availabilityLabels[point.availabilityStatus]}
        </p>
      </header>

      {point.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {point.capabilities.map((capability) => (
            <span
              key={capability}
              className="rounded-full border border-cyan-300/15 bg-cyan-400/8 px-2 py-0.5 text-[0.58rem] font-bold uppercase text-cyan-100"
            >
              {capability}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-1 rounded border border-white/10 bg-white/[0.03] p-2">
        <p className="font-semibold text-white">
          Distancia estimada: {distanceKm.toFixed(1)} km
        </p>
        <p className="text-[0.62rem] uppercase tracking-[0.1em] text-slate-500">
          ETA por transporte (velocidad promedio, demo)
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {transportOrder.map((mode) => (
            <div
              key={mode}
              className="rounded border border-white/10 bg-slate-950/60 px-2 py-1.5"
            >
              <p className="text-[0.58rem] uppercase text-slate-500">{AURA_TRANSPORT_LABELS[mode]}</p>
              <p className="font-bold text-white">{etaByMode[mode]} min</p>
            </div>
          ))}
        </div>
      </div>

      {route?.status && (
        <p className="rounded border border-amber-300/15 bg-amber-400/8 p-2 text-[0.65rem] text-amber-100">
          Estado de ruta HERMES: {route.status}
          {route.warnings && route.warnings.length > 0 ? ` · ${route.warnings[0]}` : ""}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={selectDirect}
          className={`min-h-9 rounded border px-2 py-1.5 text-[0.62rem] font-bold uppercase ${
            routeKind === "direct"
              ? "border-cyan-300/35 bg-cyan-400/14 text-cyan-100"
              : "border-white/10 bg-white/[0.03] text-slate-300"
          }`}
        >
          Ruta mas directa
        </button>
        <button
          type="button"
          onClick={selectSafe}
          disabled={loadingSafe}
          className={`min-h-9 rounded border px-2 py-1.5 text-[0.62rem] font-bold uppercase disabled:opacity-50 ${
            routeKind === "safe"
              ? "border-emerald-300/35 bg-emerald-400/14 text-emerald-100"
              : "border-white/10 bg-white/[0.03] text-slate-300"
          }`}
        >
          {loadingSafe ? "Calculando..." : "Ruta mas segura"}
        </button>
      </div>

      <button
        type="button"
        onClick={openExternalRoute}
        className="min-h-9 rounded bg-cyan-500 px-3 py-2 text-[0.65rem] font-bold uppercase text-white shadow-lg shadow-cyan-950/30"
      >
        Abrir ruta (demo, mapa externo)
      </button>

      <p className="rounded border border-rose-300/15 bg-rose-400/8 p-2 text-[0.62rem] leading-4 text-rose-100">
        ARGUS entrega apoyo logistico (ubicacion y ruta estimada), no diagnostico medico ni
        promesa de atencion garantizada.
      </p>
    </section>
  );
}
