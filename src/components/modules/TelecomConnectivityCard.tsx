"use client";

import {
  ANDROID_INSTRUCTIONS,
  IPHONE_INSTRUCTIONS,
  MANUFACTURER_VARIANCE_DISCLAIMER,
  WARNINGS,
  EMERGENCY_NUMBERS,
} from "@/content/telecomConnectivityGuidance";

/**
 * Tarjeta "Conectividad de emergencia" (ARGUS v1.0.3.6 §7): estado de
 * roaming/red de una region + guia estatica Android/iPhone/advertencias.
 * Distingue explicitamente Roaming Automatico Nacional de Roaming de
 * Emergencia (spec §3) y nunca presenta roaming internacional como
 * instruccion nacional (ese valor esta rechazado en el endpoint de ingesta,
 * ver `telecomConnectivityService.ts`).
 */

export interface TelecomConnectivityStatusDTO {
  id: string;
  adminLevel1: string;
  adminLevel2: string | null;
  carrierScope: string;
  roamingType: string;
  networkState: string;
  activationScope: string | null;
  startedAt: string | null;
  endedAt: string | null;
  sourceName: string;
  sourceUrl: string | null;
  sourcePublishedAt: string | null;
  confidence: number;
  verificationStatus: string;
  lastUpdatedAt: string;
  isStale: boolean;
}

interface Props {
  status: TelecomConnectivityStatusDTO | null;
  fromCache?: boolean;
  cachedAt?: string | null;
}

const NO_DATA = "Sin información confirmada";

const ROAMING_LABEL: Record<string, string> = {
  none: "Sin activación",
  roaming_automatico_nacional: "Roaming Automático Nacional",
  roaming_emergencia: "Roaming de Emergencia",
};

const NETWORK_LABEL: Record<string, string> = {
  normal: "Normal",
  degraded: "Degradada",
  outage: "Interrumpida",
  restored: "Restablecida",
  unknown: "Sin confirmar",
};

const NETWORK_CLASSES: Record<string, string> = {
  normal: "border-emerald-300/30 bg-emerald-500/10 text-emerald-200",
  degraded: "border-amber-300/30 bg-amber-500/10 text-amber-200",
  outage: "border-red-300/30 bg-red-500/10 text-red-200",
  restored: "border-cyan-300/30 bg-cyan-500/10 text-cyan-200",
  unknown: "border-slate-400/25 bg-slate-500/10 text-slate-400",
};

export default function TelecomConnectivityCard({ status, fromCache, cachedAt }: Props) {
  const roamingActive = Boolean(status && status.roamingType !== "none" && !status.endedAt);

  return (
    <div className="border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-300">
      {fromCache && (
        <p className="mb-2 border border-amber-300/25 bg-amber-500/10 px-2 py-1 text-[0.6rem] font-semibold uppercase text-amber-200">
          Información almacenada. Última actualización: {cachedAt ? new Date(cachedAt).toLocaleString("es-CL") : NO_DATA}
        </p>
      )}

      <p className="text-sm font-semibold text-white">
        {roamingActive
          ? "Roaming de emergencia activo en las zonas informadas por la autoridad."
          : "Roaming de emergencia: sin activación oficial confirmada."}
      </p>

      {status && (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="border border-cyan-300/30 bg-cyan-500/10 px-2 py-0.5 text-[0.58rem] font-bold uppercase text-cyan-200">
              {ROAMING_LABEL[status.roamingType] ?? status.roamingType}
            </span>
            <span className={`border px-2 py-0.5 text-[0.58rem] font-bold uppercase ${NETWORK_CLASSES[status.networkState] ?? NETWORK_CLASSES.unknown}`}>
              Red: {NETWORK_LABEL[status.networkState] ?? status.networkState}
            </span>
            {status.verificationStatus === "official" && (
              <span className="border border-emerald-300/30 bg-emerald-500/10 px-2 py-0.5 text-[0.58rem] font-bold uppercase text-emerald-200">
                Confirmado oficialmente
              </span>
            )}
          </div>

          {status.isStale && (
            <p className="mt-1.5 border border-amber-300/25 bg-amber-500/10 px-2 py-1 text-[0.6rem] font-semibold uppercase text-amber-200">
              Dato desactualizado — confirme vigencia antes de actuar
            </p>
          )}

          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-slate-500">Región</dt>
            <dd>{status.adminLevel1}</dd>
            <dt className="text-slate-500">Comuna / alcance</dt>
            <dd>{status.adminLevel2 ?? status.activationScope ?? NO_DATA}</dd>
            <dt className="text-slate-500">Operadores</dt>
            <dd className="capitalize">{status.carrierScope.replace(/_/g, " ")}</dd>
            <dt className="text-slate-500">Fuente oficial</dt>
            <dd>{status.sourceName}</dd>
            <dt className="text-slate-500">Última actualización</dt>
            <dd>{new Date(status.lastUpdatedAt).toLocaleString("es-CL")}</dd>
          </dl>

          {status.sourceUrl && (
            <a
              href={status.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[0.62rem] font-semibold uppercase tracking-wide text-cyan-300 hover:text-cyan-200"
            >
              Ver comunicado oficial →
            </a>
          )}
        </>
      )}

      <div className="mt-3 border-t border-white/10 pt-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-cyan-300">Advertencias</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.68rem] leading-relaxed text-slate-400">
          {WARNINGS.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>

      <div className="mt-3 border-t border-white/10 pt-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-cyan-300">Android</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[0.68rem] leading-relaxed text-slate-400">
          {ANDROID_INSTRUCTIONS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="mt-3 border-t border-white/10 pt-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-cyan-300">iPhone</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[0.68rem] leading-relaxed text-slate-400">
          {IPHONE_INSTRUCTIONS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <p className="mt-2 text-[0.6rem] italic text-slate-500">{MANUFACTURER_VARIANCE_DISCLAIMER}</p>

      <div className="mt-3 border-t border-white/10 pt-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-cyan-300">Números de emergencia</p>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {EMERGENCY_NUMBERS.map((entry) => (
            <div key={entry.label} className="flex items-center justify-between gap-1">
              <span className="text-slate-500">{entry.label}</span>
              <span className="font-semibold text-white">{entry.number}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
