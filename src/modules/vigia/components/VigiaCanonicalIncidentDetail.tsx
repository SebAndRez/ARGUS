"use client";

import Link from "next/link";
import { useCanonicalModuleIncidentById } from "@/hooks/useCanonicalModuleIncidents";
import IncidentShelterOperationalSection from "@/components/modules/IncidentShelterOperationalSection";
import TelecomConnectivitySection from "@/components/modules/TelecomConnectivitySection";

/**
 * ARGUS Prompt 17 §12 — vista de detalle de VIGÍA sobre un incidente
 * canónico: fuente primaria, número de fuentes, fechas, verificación,
 * confianza, geometría, lifecycle. Nunca expone payloads completos ni
 * datos sensibles — solo los campos ya presentes en `ModuleIncidentSummary`.
 */

interface Props {
  incidentId: string | null;
  canViewSourceHealth: boolean;
}

const VERIFICATION_LABEL: Record<string, string> = {
  unverified: "Sin verificar",
  candidate: "Candidato — pendiente de corroboración",
  corroborated: "Corroborado por evidencia abierta/técnica",
  official: "Alerta oficial",
  rejected: "Rechazado",
};

export default function VigiaCanonicalIncidentDetail({ incidentId, canViewSourceHealth }: Props) {
  const result = useCanonicalModuleIncidentById("argus-vigia", incidentId);

  if (!incidentId || !result) {
    return (
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Detalle de incidente canónico</h2>
        <p className="mt-2 text-xs text-slate-500">Selecciona un incidente para ver su detalle.</p>
      </section>
    );
  }

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Detalle de incidente canónico</h2>

      {result.state === "loading" && <p className="mt-2 text-xs text-slate-500">Cargando…</p>}
      {result.state === "unauthorized" && <p className="mt-2 text-xs text-amber-300">No autorizado para ver este incidente.</p>}
      {(result.state === "unavailable" || result.state === "insufficient_data") && "error" in result && (
        <p className="mt-2 text-xs text-rose-300">{result.error.message}</p>
      )}

      {"data" in result && (
        <div className="mt-2 grid gap-2 text-xs text-slate-300">
          <p className="text-sm font-semibold text-white">{result.data.title}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <dt className="text-slate-500">Tipo</dt>
            <dd>{result.data.type}</dd>
            <dt className="text-slate-500">Severidad</dt>
            <dd className="uppercase">{result.data.severity}</dd>
            <dt className="text-slate-500">Lifecycle</dt>
            <dd className="uppercase">{result.data.lifecycle}</dd>
            <dt className="text-slate-500">Verificación</dt>
            <dd>{VERIFICATION_LABEL[result.data.verificationStatus] ?? result.data.verificationStatus}</dd>
            <dt className="text-slate-500">Confianza</dt>
            <dd className="uppercase">{result.data.confidence}</dd>
            <dt className="text-slate-500">Fuente primaria</dt>
            <dd>{result.data.sourceSummary.primarySource ?? "—"}</dd>
            <dt className="text-slate-500">Fuentes totales</dt>
            <dd>{result.data.sourceSummary.sourceCount}</dd>
            <dt className="text-slate-500">¿Oficial?</dt>
            <dd>{result.data.sourceSummary.isOfficial ? "Sí" : "No"}</dd>
            <dt className="text-slate-500">País</dt>
            <dd>{result.data.location.countryCode ?? "—"}</dd>
            <dt className="text-slate-500">Actualizado</dt>
            <dd>{new Date(result.data.timing.updatedAt).toLocaleString("es-CL")}</dd>
          </dl>

          <div className="mt-2 flex flex-wrap gap-3 border-t border-white/10 pt-2">
            <Link
              href={`/modules/oraculo?incidentId=${encodeURIComponent(result.data.id)}`}
              className="text-[0.65rem] font-semibold uppercase tracking-wide text-violet-300 hover:text-violet-200"
            >
              Analizar en ORÁCULO →
            </Link>
            <Link
              href={`/modules/talos?incidentId=${encodeURIComponent(result.data.id)}`}
              className="text-[0.65rem] font-semibold uppercase tracking-wide text-fuchsia-300 hover:text-fuchsia-200"
            >
              Evaluar impacto en TALOS →
            </Link>
          </div>

          <IncidentShelterOperationalSection
            latitude={result.data.location.latitude}
            longitude={result.data.location.longitude}
          />

          <TelecomConnectivitySection
            latitude={result.data.location.latitude}
            longitude={result.data.location.longitude}
            region={result.data.location.regionCode}
          />
        </div>
      )}

      {!canViewSourceHealth && (
        <p className="mt-3 border-t border-white/10 pt-2 text-[0.6rem] text-slate-600">
          El estado de las fuentes de ingestión (Source Health) solo está disponible para operadores autorizados.
        </p>
      )}
    </section>
  );
}
