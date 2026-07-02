import FenixPredictionFrameCard from "@/components/fenix/FenixPredictionFrameCard";
import type { FenixPredictionFrame, FenixSimulationResult } from "@/types/fenixSimulation";

const fallbackTitles = [
  "Fase 1 - Impacto inicial",
  "Fase 2 - Proyeccion media",
  "Fase 3 - Proyeccion extendida",
] as const;

function isPredictionFrame(value: unknown): value is FenixPredictionFrame {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FenixPredictionFrame>;
  return (
    typeof candidate.id === "string" &&
    Array.isArray(candidate.center) &&
    Array.isArray(candidate.origin) &&
    typeof candidate.radiusKm === "number"
  );
}

function buildFallbackFrames(result: FenixSimulationResult): FenixPredictionFrame[] {
  const origin: [number, number] = [
    result.input.initialLocation.latitude,
    result.input.initialLocation.longitude,
  ];
  const zones = [
    result.affectedZones[0],
    result.affectedZones[Math.max(1, Math.floor((result.affectedZones.length - 1) / 2))],
    result.affectedZones[result.affectedZones.length - 1],
  ].filter(Boolean);

  return zones.slice(0, 3).map((zone, index) => ({
    id: `fallback-frame-${index + 1}`,
    phaseIndex: (index + 1) as 1 | 2 | 3,
    title: fallbackTitles[index],
    label:
      index === 0
        ? "avance inicial estimado"
        : index === 1
          ? "avance medio estimado"
          : "avance extendido/final estimado",
    summary: "Snapshot operativo calculado desde los parametros actuales de Fenix.",
    timeLabel: zone.timeLabel,
    radiusKm: zone.radiusKm,
    center: zone.center,
    origin,
    direction: result.input.growth.direction,
    populationExposure: result.course.populationExposure.estimatedPeople,
    routeImpacts: result.routeImpacts.filter((route) => route.status !== "open").length,
    relatedReports: result.reportDensity.relatedReports,
    confidence: result.confidence,
    uncertainty: result.uncertainty,
    severity: zone.exposureLevel,
    isDemo: true,
  }));
}

export default function FenixPredictionFrames({ result }: { result: FenixSimulationResult }) {
  const frames = (result.predictionFrames ?? []).filter(isPredictionFrame);
  const visibleFrames = frames.length >= 3 ? frames.slice(0, 3) : buildFallbackFrames(result);

  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/85 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
            Fenix Twin
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">
            Evolucion estimada del evento
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Tres fases visuales calculadas a partir de las coordenadas, direccion,
            velocidad y parametros de la simulacion.
          </p>
        </div>
        <span className="rounded border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[0.58rem] font-bold uppercase text-amber-100">
          No oficial
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {visibleFrames.map((frame) => (
          <FenixPredictionFrameCard key={frame.id} frame={frame} />
        ))}
      </div>
    </section>
  );
}
