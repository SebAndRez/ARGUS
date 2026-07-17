"use client";

import Link from "next/link";
import type { FenixShelter, FenixShelterStatus } from "@/types/fenix";

/**
 * Ficha de un refugio real (`FenixShelter` poblado desde `CriticalPoi` +
 * `CriticalPoiOperationalStatus` via `/api/fenix/shelters`), reusada tanto
 * en el panel operacional de un incidente (VIGÍA) como en el listado de
 * refugios de FÉNIX — una sola representacion, spec ARGUS v1.0.3.4 §12.
 * Nunca muestra un campo ausente como 0/false: usa "Sin información
 * confirmada".
 */

interface Props {
  shelter: FenixShelter;
}

const STATUS_LABEL: Record<FenixShelterStatus, string> = {
  available: "Disponible",
  near_capacity: "Capacidad limitada",
  full: "Lleno",
  closed: "Cerrado",
  compromised: "No recomendado",
  unknown: "Sin confirmar",
};

const STATUS_CLASSES: Record<FenixShelterStatus, string> = {
  available: "border-emerald-300/30 bg-emerald-500/10 text-emerald-200",
  near_capacity: "border-amber-300/30 bg-amber-500/10 text-amber-200",
  full: "border-red-300/30 bg-red-500/10 text-red-200",
  closed: "border-slate-400/25 bg-slate-500/10 text-slate-300",
  compromised: "border-red-300/30 bg-red-500/10 text-red-200",
  unknown: "border-slate-400/25 bg-slate-500/10 text-slate-400",
};

const SERVICE_LABELS: Array<{ key: keyof FenixShelter; label: string }> = [
  { key: "waterAvailable", label: "Agua" },
  { key: "powerAvailable", label: "Electricidad" },
  { key: "hasFood", label: "Alimentación" },
  { key: "medicalSupport", label: "Atención médica" },
  { key: "hasHeating", label: "Calefacción" },
  { key: "hasBathrooms", label: "Baños" },
  { key: "hasShowers", label: "Duchas" },
  { key: "isAccessible", label: "Accesibilidad universal" },
  { key: "allowsPets", label: "Acepta mascotas" },
  { key: "hasConnectivity", label: "Conectividad" },
];

function serviceValueLabel(value: unknown): string {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "Sin confirmar";
}

const NO_DATA = "Sin información confirmada";

const FENIX_TIER_LABEL: Record<string, string> = {
  confirmed: "Destino confirmado",
  potential: "Destino potencial",
  reference: "Referencia institucional",
};

const FENIX_TIER_CLASSES: Record<string, string> = {
  confirmed: "border-emerald-300/30 bg-emerald-500/10 text-emerald-200",
  potential: "border-amber-300/30 bg-amber-500/10 text-amber-200",
  reference: "border-slate-400/25 bg-slate-500/10 text-slate-400",
};

export default function ShelterOperationalStatusCard({ shelter }: Props) {
  // "Cupos" publicado por fuentes como Codigo Azul (capacityDeclared) nunca
  // se interpreta como disponibilidad — solo capacityTotal/currentOccupancy
  // confirmados (de una fuente de mayor precedencia) permiten calcular
  // cupos disponibles reales. Spec ARGUS v1.0.3.5 §4/§18.
  const capacityAvailable =
    typeof shelter.capacity === "number" && typeof shelter.currentOccupancy === "number"
      ? Math.max(shelter.capacity - shelter.currentOccupancy, 0)
      : null;
  const isApproximateLocation = Boolean(shelter.locationAccuracy) && shelter.locationAccuracy !== "precise";

  return (
    <div className="border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-300">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{shelter.name}</p>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`border px-2 py-0.5 text-[0.58rem] font-bold uppercase ${STATUS_CLASSES[shelter.status]}`}>
            {STATUS_LABEL[shelter.status]}
          </span>
          {shelter.fenixRecommendationTier && (
            <span className={`border px-2 py-0.5 text-[0.55rem] font-bold uppercase ${FENIX_TIER_CLASSES[shelter.fenixRecommendationTier]}`}>
              {FENIX_TIER_LABEL[shelter.fenixRecommendationTier]}
            </span>
          )}
        </div>
      </div>

      {shelter.isStale && (
        <p className="mt-1.5 border border-amber-300/25 bg-amber-500/10 px-2 py-1 text-[0.6rem] font-semibold uppercase text-amber-200">
          Dato desactualizado — no usar como referencia principal
        </p>
      )}

      {isApproximateLocation && (
        <p className="mt-1.5 border border-slate-400/25 bg-slate-500/10 px-2 py-1 text-[0.6rem] font-semibold uppercase text-slate-300">
          Ubicación aproximada — no es la dirección exacta verificada
        </p>
      )}

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-slate-500">Dirección</dt>
        <dd>{shelter.address ?? NO_DATA}</dd>
        <dt className="text-slate-500">Capacidad total</dt>
        <dd>{shelter.capacity ?? NO_DATA}</dd>
        {typeof shelter.capacityDeclared === "number" && (
          <>
            <dt className="text-slate-500">Capacidad declarada</dt>
            <dd>{shelter.capacityDeclared} cupos</dd>
          </>
        )}
        <dt className="text-slate-500">Ocupación</dt>
        <dd>{shelter.currentOccupancy ?? NO_DATA}</dd>
        <dt className="text-slate-500">Disponibilidad actual</dt>
        <dd>{capacityAvailable ?? NO_DATA}</dd>
        <dt className="text-slate-500">Organismo</dt>
        <dd>{shelter.operatorName ?? NO_DATA}</dd>
        <dt className="text-slate-500">Contacto</dt>
        <dd>{shelter.contactPhone ?? NO_DATA}</dd>
        <dt className="text-slate-500">Estado de ruta</dt>
        <dd className="capitalize">{shelter.routeStatus ?? NO_DATA}</dd>
        <dt className="text-slate-500">Fuente</dt>
        <dd>{shelter.sourceName ?? NO_DATA}</dd>
        <dt className="text-slate-500">Confianza</dt>
        <dd>{typeof shelter.confidence === "number" ? `${shelter.confidence}%` : NO_DATA}</dd>
        <dt className="text-slate-500">Última verificación</dt>
        <dd>{shelter.lastVerifiedAt ? new Date(shelter.lastVerifiedAt).toLocaleString("es-CL") : NO_DATA}</dd>
        <dt className="text-slate-500">Horario publicado</dt>
        <dd>{shelter.operatingHours ?? NO_DATA}</dd>
      </dl>

      {typeof shelter.capacityDeclared === "number" && (
        <p className="mt-2 border-t border-white/10 pt-2 text-[0.6rem] leading-relaxed text-slate-400">
          La capacidad declarada no representa necesariamente cupos disponibles en este momento.
          Confirme la disponibilidad con la autoridad responsable antes de desplazarse.
        </p>
      )}

      <div className="mt-2 grid grid-cols-2 gap-1 border-t border-white/10 pt-2">
        {SERVICE_LABELS.map((service) => (
          <div key={String(service.key)} className="flex items-center justify-between gap-1">
            <span className="text-slate-500">{service.label}</span>
            <span className="font-semibold">{serviceValueLabel(shelter[service.key])}</span>
          </div>
        ))}
      </div>

      {shelter.poiId && (
        <div className="mt-2 flex flex-wrap gap-3 border-t border-white/10 pt-2">
          <Link
            href={`/app?lat=${shelter.coordinates[0]}&lng=${shelter.coordinates[1]}&criticalPoiId=${encodeURIComponent(shelter.poiId)}&navDestination=${shelter.coordinates[0]},${shelter.coordinates[1]}`}
            className="text-[0.62rem] font-semibold uppercase tracking-wide text-cyan-300 hover:text-cyan-200"
          >
            Calcular ruta →
          </Link>
          <Link
            href={`/modules/fenix?shelterId=${encodeURIComponent(shelter.poiId)}`}
            className="text-[0.62rem] font-semibold uppercase tracking-wide text-violet-300 hover:text-violet-200"
          >
            Abrir en FÉNIX →
          </Link>
        </div>
      )}
    </div>
  );
}
