"use client";

import { useMemo } from "react";
import OperationalMap from "@/components/map/OperationalMap";
import type { CrisisEvent, EventSeverity, UserLocationStatus } from "@/types/crisis";
import type { MapLayerState } from "@/components/map/MapLayerControls";
import type { BaseMapType } from "@/types/map";
import type { VigiaReport } from "@/modules/vigia/types";
import { vigiaReportTypeLabel } from "@/modules/vigia/utils";

const toEventSeverity: Record<VigiaReport["severity"], EventSeverity> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};

/**
 * Convierte reportes VIGÍA en `CrisisEvent` compatibles con `OperationalMap`
 * sin tocar el mapa ni el tipo `CrisisEvent`. Reglas de visibilidad pública:
 * - rechazados no aparecen;
 * - duplicados se agrupan bajo el reporte original (no se listan aparte);
 * - confirmados quedan con mayor prioridad visual (severidad tal cual);
 * - pendientes aparecen igual, pero como reportes sin confirmar.
 */
export function vigiaReportsToMapEvents(reports: VigiaReport[]): CrisisEvent[] {
  return reports
    .filter((report) => report.status !== "rejected" && report.status !== "duplicate")
    .map((report) => ({
      id: report.id,
      title: report.title || vigiaReportTypeLabel[report.type],
      category: report.type,
      description: report.description,
      latitude: report.location.lat,
      longitude: report.location.lng,
      locationText: report.location.label,
      severity: toEventSeverity[report.severity],
      type: "REPORT",
      status: report.status === "confirmed" ? "VALIDATED" : report.status === "escalated" ? "ESCALATED" : "NEW",
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      author: report.reporter.alias,
      isDemo: report.isDemo,
      restrictedMode: report.location.isApproximate,
    }));
}

interface Props {
  reports: VigiaReport[];
  location: { latitude: number; longitude: number };
  locationStatus: UserLocationStatus;
  selectedEventId?: string;
  onEventSelect: (event: CrisisEvent) => void;
  baseMapType: BaseMapType;
}

export default function VigiaMapBridge({
  reports,
  location,
  locationStatus,
  selectedEventId,
  onEventSelect,
  baseMapType,
}: Props) {
  const events = useMemo(() => vigiaReportsToMapEvents(reports), [reports]);
  const layerSettings: MapLayerState = useMemo(
    () => ({
      reports: true,
      sos: false,
      alerts: false,
      critical: true,
      resolved: false,
      user: true,
      visualSources: false,
      officialSources: false,
      publicCameras: false,
      weatherRisk: false,
      usgsShakeMapIntensity: false,
      usgsPagerImpactAssessment: false,
      openMeteoWeatherContext: false,
      smithsonianGvpVolcanoes: false,
      smithsonianGvpEruptionHistory: false,
      smithsonianUsgsVolcanicActivityReports: false,
      noaaNceiHistoricalTsunamis: false,
      openFemaDisasterDeclarations: false,
      osmCriticalInfrastructure: false,
      hdxHapiHumanitarianContext: false,
      whoDiseaseOutbreakNews: false,
      ecdcPublicHealthThreats: false,
      gdeltMediaSignals: false,
      copernicusGlofasFloodForecast: false,
      copernicusGfmObservedFloodExtent: false,
      terrestrialRoutes: false,
      airRoutes: false,
      maritimeRoutes: false,
    }),
    []
  );

  return (
    <section className="flex min-h-[380px] flex-col border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/30">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-cyan-300">
            Reportes en el mapa
          </p>
          <p className="text-xs text-slate-400">{events.length} reportes visibles</p>
        </div>
        <a
          href="/app"
          className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"
        >
          Ver mapa completo
        </a>
      </header>
      <div className="relative min-h-[340px] flex-1">
        <OperationalMap
          events={events}
          selectedEventId={selectedEventId}
          onEventSelect={onEventSelect}
          location={location}
          locationStatus={locationStatus}
          layerSettings={layerSettings}
          baseMapType={baseMapType}
        />
      </div>
    </section>
  );
}
