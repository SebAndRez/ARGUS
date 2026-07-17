"use client";

import { useEffect, useState } from "react";
import type { IncidentImpactAssessment } from "@/types/incidentImpactAssessment";

/**
 * ARGUS Prompt 6 — sección de análisis de impacto geoespacial dentro del
 * detalle de incidente canónico. Reusa `GET /api/modules/incidents/[id]/impact`
 * (mismo servicio que calcula el resultado, ver `incidentImpactAssessment.ts`)
 * en vez de recalcular nada en el cliente.
 */

interface Props {
  incidentId: string;
  moduleId: "argus-atlas" | "argus-vigia" | "argus-oraculo" | "argus-talos";
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

const SPATIAL_RELATION_LABEL: Record<string, string> = {
  INSIDE: "Dentro del área",
  BORDER: "En el borde del área",
  NEAR: "Cercano",
  OUTSIDE: "Fuera del área",
  NOT_DETERMINED: "No determinado",
};

export default function IncidentImpactSection({ incidentId, moduleId }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [assessment, setAssessment] = useState<IncidentImpactAssessment | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    fetch(`/api/modules/incidents/${encodeURIComponent(incidentId)}/impact?module=${moduleId}`, {
      signal: AbortSignal.timeout(15_000),
    })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          setState("unauthorized");
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        const data = (await response.json()) as IncidentImpactAssessment;
        setAssessment(data);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [incidentId, moduleId]);

  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
        Análisis de impacto geoespacial
      </h3>

      {state === "loading" && <p className="mt-2 text-xs text-slate-500">Calculando impacto…</p>}
      {state === "unauthorized" && (
        <p className="mt-2 text-xs text-slate-600">Disponible solo para operadores autorizados.</p>
      )}
      {state === "error" && <p className="mt-2 text-xs text-rose-300">No se pudo calcular el análisis de impacto.</p>}

      {state === "ready" && assessment && (
        <div className="mt-2 grid gap-3 text-xs text-slate-300">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-slate-500">Prioridad operacional</dt>
            <dd className="uppercase">
              {assessment.priority.level} ({assessment.priority.score}/100)
            </dd>
            <dt className="text-slate-500">Infraestructura crítica</dt>
            <dd>
              {assessment.infrastructure.dataState === "CALCULATED"
                ? `${assessment.infrastructure.assets.length} activo(s) — radio ${assessment.infrastructure.searchRadiusKm}km`
                : "No calculada"}
            </dd>
            <dt className="text-slate-500">Población expuesta</dt>
            <dd>No disponible</dd>
            <dt className="text-slate-500">Rutas afectadas</dt>
            <dd>No disponible</dd>
          </dl>

          {assessment.infrastructure.assets.length > 0 && (
            <div className="grid gap-1.5">
              {assessment.infrastructure.assets.slice(0, 8).map((asset) => (
                <div key={asset.poiId} className="border border-white/5 bg-slate-900/60 px-2 py-1.5">
                  <p className="font-semibold text-slate-100">{asset.name}</p>
                  <p className="text-[0.65rem] text-slate-400">
                    {asset.category} · {asset.priority} · {SPATIAL_RELATION_LABEL[asset.spatialRelation] ?? asset.spatialRelation}
                    {asset.distanceKm !== null ? ` · ${asset.distanceKm}km` : ""}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] text-amber-200/80">{asset.verificationRecommendation}</p>
                </div>
              ))}
            </div>
          )}

          {assessment.suggestedActions.length > 0 && (
            <div className="grid gap-1">
              <p className="text-slate-500">Acciones sugeridas</p>
              {assessment.suggestedActions.map((action, index) => (
                <p key={index} className="text-[0.68rem] text-slate-300">
                  · {action.action}{" "}
                  <span className="text-slate-600">
                    ({action.status === "SUGGESTED" ? "sugerida" : "pendiente de validación"})
                  </span>
                </p>
              ))}
            </div>
          )}

          <details className="text-[0.65rem] text-slate-500">
            <summary className="cursor-pointer">Limitaciones de este análisis</summary>
            <ul className="mt-1 grid gap-0.5 pl-3">
              {assessment.limitations.map((limitation, index) => (
                <li key={index} className="list-disc">
                  {limitation}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
