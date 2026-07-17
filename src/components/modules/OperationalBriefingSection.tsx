"use client";

import { useEffect, useState } from "react";
import type { OperationalBriefingResult } from "@/lib/briefing/operationalBriefing";
import { lifecycleLabel } from "@/lib/briefing/deterministicBriefingBuilder";

/**
 * ARGUS Prompt 8 — sección de síntesis operacional dentro del detalle de
 * incidente canónico. Reusa `GET /api/modules/incidents/[id]/briefing`
 * (mismo servicio que compone el resultado) — no recalcula nada en el
 * cliente ni presenta "IA" como marca de autoridad (mandato §41/§43): todo
 * lo mostrado aquí es determinista.
 */

interface Props {
  incidentId: string;
  moduleId: "argus-atlas" | "argus-vigia" | "argus-oraculo" | "argus-talos";
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

export default function OperationalBriefingSection({ incidentId, moduleId }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [result, setResult] = useState<OperationalBriefingResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    fetch(`/api/modules/incidents/${encodeURIComponent(incidentId)}/briefing?module=${moduleId}`, {
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
        const data = (await response.json()) as OperationalBriefingResult;
        setResult(data);
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
      <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Síntesis operacional ARGUS</h3>

      {state === "loading" && <p className="mt-2 text-xs text-slate-500">Componiendo briefing…</p>}
      {state === "unauthorized" && (
        <p className="mt-2 text-xs text-slate-600">Disponible solo para operadores autorizados.</p>
      )}
      {state === "error" && <p className="mt-2 text-xs text-rose-300">No se pudo componer la síntesis operacional.</p>}

      {state === "ready" && result && (
        <div className="mt-2 grid gap-3 text-xs text-slate-300">
          <p className="text-slate-200">{result.briefing.executiveSummary}</p>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-slate-500">Estado</dt>
            <dd className="uppercase">{lifecycleLabel(result.briefing.status.lifecycle)}</dd>
            <dt className="text-slate-500">Prioridad</dt>
            <dd className="uppercase">{result.briefing.status.priority}</dd>
            <dt className="text-slate-500">Vigencia del briefing</dt>
            <dd>{result.briefing.freshness}</dd>
            <dt className="text-slate-500">Confianza del briefing</dt>
            <dd>{result.briefing.evidence.briefingConfidence}/100</dd>
            <dt className="text-slate-500">Tendencia</dt>
            <dd>{result.briefing.trend === "SIN_DATOS_SUFICIENTES" ? "Sin datos suficientes" : result.briefing.trend}</dd>
          </dl>

          {result.briefing.compositeRisks.length > 0 && (
            <div className="grid gap-1">
              <p className="text-slate-500">Riesgos compuestos</p>
              {result.briefing.compositeRisks.map((risk, index) => (
                <p key={index} className="text-[0.68rem]">
                  · {risk.rule} <span className="text-slate-600">(nivel {risk.level}, confianza {risk.confidence})</span>
                </p>
              ))}
            </div>
          )}

          {result.briefing.actions.length > 0 && (
            <div className="grid gap-1">
              <p className="text-slate-500">Acciones recomendadas</p>
              {result.briefing.actions.map((action, index) => (
                <p key={index} className="text-[0.68rem]">
                  · {action.action} <span className="text-slate-600">({action.status.toLowerCase().replace("_", " ")})</span>
                </p>
              ))}
            </div>
          )}

          {result.comparison.hasMaterialChanges && (
            <div className="grid gap-1 border border-amber-400/20 bg-amber-400/5 p-2">
              <p className="text-amber-200">Cambios desde la versión anterior</p>
              {result.comparison.entries.map((entry, index) => (
                <p key={index} className="text-[0.68rem] text-amber-100/90">
                  · {entry.field}: {entry.from ?? "—"} → {entry.to ?? "—"} ({entry.kind.toLowerCase()})
                </p>
              ))}
            </div>
          )}

          <details className="text-[0.65rem] text-slate-500">
            <summary className="cursor-pointer">Información pendiente y limitaciones</summary>
            <ul className="mt-1 grid gap-0.5 pl-3">
              {result.briefing.gaps.map((gap, index) => (
                <li key={index} className="list-disc">
                  {gap.description}
                </li>
              ))}
            </ul>
          </details>

          <p className="text-[0.6rem] text-slate-600">
            Briefing v{result.briefing.briefingVersion} · determinista · sin proveedor generativo habilitado
          </p>
        </div>
      )}
    </section>
  );
}
