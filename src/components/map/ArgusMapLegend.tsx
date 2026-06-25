"use client";

import { useState } from "react";
import {
  createArgusMarkerHtml,
  type ArgusMapConfidence,
  type ArgusMapEventKind,
  type ArgusMapSeverity,
} from "@/lib/mapSymbols/argusMapSymbols";

const symbolRows: Array<{
  kind: ArgusMapEventKind;
  severity: ArgusMapSeverity;
  confidence: ArgusMapConfidence;
  label?: string;
  text: string;
}> = [
  { kind: "earthquake", severity: "high", confidence: "official", text: "Terremoto / sismo" },
  { kind: "tsunami", severity: "critical", confidence: "official", text: "Tsunami" },
  { kind: "fire", severity: "high", confidence: "raw", text: "Incendio / foco termico" },
  { kind: "wind", severity: "info", confidence: "verified", text: "Clima / viento / humo" },
  { kind: "citizen_report", severity: "medium", confidence: "reported", label: "R", text: "Reporte ciudadano" },
  { kind: "force_report", severity: "high", confidence: "verified", text: "Reporte de fuerzas" },
  { kind: "official_source", severity: "info", confidence: "official", label: "I", text: "Fuente oficial / inteligencia" },
  { kind: "live_camera", severity: "info", confidence: "reported", label: "C", text: "Camara en vivo" },
  { kind: "user", severity: "info", confidence: "verified", label: "MI", text: "Mi ubicacion" },
];

const colorRows: Array<[ArgusMapSeverity, string]> = [
  ["info", "Informativo"],
  ["low", "Bajo"],
  ["medium", "Medio"],
  ["high", "Alto"],
  ["critical", "Critico"],
];

const confidenceRows: Array<[ArgusMapConfidence, string]> = [
  ["raw", "dato bruto"],
  ["reported", "reportado"],
  ["verified", "verificado"],
  ["official", "oficial"],
  ["multi_source", "multi-fuente"],
];

export default function ArgusMapLegend() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section className="border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span>
          <span className="block text-[0.6rem] font-bold uppercase tracking-[0.18em] text-cyan-200">
            Simbologia ARGUS
          </span>
          <span className="text-[0.62rem] text-slate-500">
            forma = tipo · color = severidad · borde = confianza
          </span>
        </span>
        <span className="text-xs font-bold text-slate-400">
          {collapsed ? "+" : "-"}
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-3 border-t border-white/10 p-3">
          <div className="grid gap-2">
            {symbolRows.map((row) => (
              <div key={`${row.kind}-${row.text}`} className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center"
                  dangerouslySetInnerHTML={{
                    __html: createArgusMarkerHtml({
                      kind: row.kind,
                      severity: row.severity,
                      confidence: row.confidence,
                      label: row.label,
                      title: row.text,
                    }),
                  }}
                />
                <span className="text-xs text-slate-300">{row.text}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-1.5 border-t border-white/10 pt-3">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-slate-500">
              Prioridad por color
            </p>
            <div className="flex flex-wrap gap-1.5">
              {colorRows.map(([severity, label]) => (
                <span
                  key={severity}
                  className={`border px-2 py-1 text-[0.56rem] font-bold uppercase ${
                    severity === "critical"
                      ? "border-red-300/30 bg-red-500/15 text-red-200"
                      : severity === "high"
                        ? "border-orange-300/30 bg-orange-500/15 text-orange-200"
                        : severity === "medium"
                          ? "border-yellow-300/30 bg-yellow-400/15 text-yellow-100"
                          : severity === "low"
                            ? "border-emerald-300/30 bg-emerald-400/12 text-emerald-200"
                            : "border-cyan-300/30 bg-cyan-400/12 text-cyan-200"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-slate-500">
              Confianza por borde
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {confidenceRows.map(([confidence, label]) => (
                <span
                  key={confidence}
                  className="border border-white/10 bg-slate-950/60 px-2 py-1 text-[0.58rem] uppercase text-slate-300"
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[0.6rem] leading-4 text-slate-500">
              Linea punteada = estimado/reportado. Doble borde = multiples fuentes.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
