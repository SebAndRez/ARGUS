"use client";

import { useEffect, useState } from "react";
import type { TerritorialDossier } from "@/types/territorialDossier";

/**
 * ARGUS Prompt 7 — sección de expediente territorial dentro del detalle de
 * incidente canónico. Reusa `GET /api/modules/incidents/[id]/dossier` (mismo
 * servicio que compone el resultado, ver `territorialDossier.ts`) — no
 * recalcula nada en el cliente.
 */

interface Props {
  incidentId: string;
  moduleId: "argus-atlas" | "argus-vigia" | "argus-oraculo" | "argus-talos";
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

const RELATION_LABEL: Record<string, string> = {
  LOCATED_IN: "ubicado en",
  AFFECTS: "afecta a",
  CORRELATED_WITH: "correlacionado con",
};

export default function TerritorialDossierSection({ incidentId, moduleId }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [dossier, setDossier] = useState<TerritorialDossier | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    fetch(`/api/modules/incidents/${encodeURIComponent(incidentId)}/dossier?module=${moduleId}`, {
      signal: AbortSignal.timeout(20_000),
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
        const data = (await response.json()) as TerritorialDossier;
        setDossier(data);
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
      <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Expediente territorial</h3>

      {state === "loading" && <p className="mt-2 text-xs text-slate-500">Componiendo expediente…</p>}
      {state === "unauthorized" && (
        <p className="mt-2 text-xs text-slate-600">Disponible solo para operadores autorizados.</p>
      )}
      {state === "error" && <p className="mt-2 text-xs text-rose-300">No se pudo componer el expediente territorial.</p>}

      {state === "ready" && dossier && (
        <div className="mt-2 grid gap-3 text-xs text-slate-300">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-slate-500">Estado del expediente</dt>
            <dd className="uppercase">{dossier.overallStatus}</dd>
            <dt className="text-slate-500">Áreas administrativas</dt>
            <dd>
              {dossier.territory.intersectedAdministrativeAreas.length > 0
                ? dossier.territory.intersectedAdministrativeAreas.join(", ")
                : dossier.territory.regionCode ?? "No resuelto"}
            </dd>
            <dt className="text-slate-500">Incidentes relacionados</dt>
            <dd>{dossier.relatedIncidents.status === "AVAILABLE" ? dossier.relatedIncidents.data.length : "No disponible"}</dd>
            <dt className="text-slate-500">Refugios cercanos</dt>
            <dd>{dossier.shelters.status === "AVAILABLE" ? dossier.shelters.data.length : "No disponible"}</dd>
            <dt className="text-slate-500">Organizaciones</dt>
            <dd>No disponible</dd>
            <dt className="text-slate-500">Riesgos históricos</dt>
            <dd>No disponible</dd>
          </dl>

          {dossier.relatedIncidents.status === "AVAILABLE" && dossier.relatedIncidents.data.length > 0 && (
            <div className="grid gap-1">
              <p className="text-slate-500">Incidentes en el mismo territorio</p>
              {dossier.relatedIncidents.data.slice(0, 5).map((related) => (
                <p key={related.id} className="text-[0.68rem]">
                  · {related.title} <span className="text-slate-600">({related.severity})</span>
                </p>
              ))}
            </div>
          )}

          {dossier.relationships.length > 0 && (
            <div className="grid gap-1">
              <p className="text-slate-500">Relaciones ({dossier.relationships.length})</p>
              {dossier.relationships.slice(0, 8).map((relation) => (
                <p key={relation.id} className="text-[0.68rem]">
                  · {RELATION_LABEL[relation.relationType] ?? relation.relationType} <span className="text-slate-100">{relation.targetLabel}</span>{" "}
                  <span className="text-slate-600">
                    ({relation.status.toLowerCase()}, confianza {relation.confidence})
                  </span>
                </p>
              ))}
            </div>
          )}

          <details className="text-[0.65rem] text-slate-500">
            <summary className="cursor-pointer">Limitaciones de este expediente</summary>
            <ul className="mt-1 grid gap-0.5 pl-3">
              {dossier.limitations.map((limitation, index) => (
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
