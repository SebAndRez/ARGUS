"use client";

import { useMemo, useState } from "react";
import QuakeSenseClusterBadge from "@/components/quakesense/QuakeSenseClusterBadge";
import QuakeSensePreliminaryAlert from "@/components/quakesense/QuakeSensePreliminaryAlert";
import ProductStatusBadge from "@/components/status/ProductStatusBadge";
import ExperimentalNotice from "@/components/status/ExperimentalNotice";
import { demoQuakeSenseCluster } from "@/data/quakesenseDemo";
import { useQuakeSenseMotion } from "@/hooks/useQuakeSenseMotion";
import {
  createEphemeralQuakeSenseSessionId,
  hashSessionId,
  roundLocation,
} from "@/lib/quakesense/privacy";
import type { QuakeSenseCluster } from "@/types/quakesense";

interface Props {
  location: { latitude: number; longitude: number; accuracy?: number };
  onClose: () => void;
  onDemoCluster?: (cluster: QuakeSenseCluster) => void;
}

export default function QuakeSensePanel({
  location,
  onClose,
  onDemoCluster,
}: Props) {
  const motion = useQuakeSenseMotion();
  const [lastCluster, setLastCluster] = useState<QuakeSenseCluster | null>(null);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const sessionId = useMemo(() => createEphemeralQuakeSenseSessionId(), []);

  const sendDetection = async () => {
    if (!motion.detection) return;
    const sessionIdHash = await hashSessionId(sessionId);
    const rounded = motion.settings.shareApproxLocation
      ? roundLocation(location.latitude, location.longitude)
      : {};
    const response = await fetch("/api/quakesense/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `qs-web-${Date.now()}`,
        sessionIdHash,
        detectedAt: motion.detection.detectedAt,
        ...rounded,
        accuracyBand: motion.settings.shareApproxLocation ? "district" : "none",
        peakAcceleration: motion.detection.peakAcceleration,
        confidence: motion.detection.confidence,
        userConsent: true,
        source: "citizen_sensor",
      }),
    });
    const payload = await response.json();
    setSendMessage(payload.message ?? "Senal enviada.");
    if (payload.cluster) setLastCluster(payload.cluster);
  };

  const activateDemo = () => {
    setLastCluster(demoQuakeSenseCluster);
    onDemoCluster?.(demoQuakeSenseCluster);
  };

  return (
    <aside className="argus-module-panel max-h-[calc(100svh-1rem)] overflow-y-auto">
      <header className="argus-module-panel-header">
        <div>
          <ProductStatusBadge kind="EXPERIMENTAL" />
          <h2 className="mt-1 text-lg font-semibold text-white">ARGUS QuakeSense</h2>
          <p className="mt-1 text-xs text-slate-400">
            Sensor ciudadano sismico Web/PWA.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-300"
        >
          Cerrar
        </button>
      </header>

      <div className="argus-module-panel-body">
        <ExperimentalNotice>
          ARGUS QuakeSense es experimental. Detecta posibles sacudidas desde
          señales ciudadanas o sensores compatibles. No es una alerta oficial y
          debe confirmarse con fuentes oficiales.
        </ExperimentalNotice>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <State label="Estado" value={motion.status} />
          <State label="Permiso" value={motion.permissionState} />
          <State label="Soporte" value={motion.isSupported ? "Disponible" : "No soportado"} />
          <State
            label="Muestra"
            value={motion.latestSample ? motion.latestSample.accelerationMagnitude.toFixed(1) : "N/D"}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={motion.settings.shareApproxLocation}
            onChange={(event) =>
              motion.updateSettings({ shareApproxLocation: event.target.checked })
            }
          />
          Compartir ubicacion aproximada solo si hay deteccion.
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={motion.requestPermission}
            className="border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs font-bold uppercase text-cyan-100"
          >
            Permitir sensor
          </button>
          <button
            type="button"
            onClick={motion.isListening ? motion.stop : motion.start}
            className="border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold uppercase text-slate-200"
          >
            {motion.isListening ? "Pausar" : "Activar sensor"}
          </button>
          <button
            type="button"
            onClick={activateDemo}
            className="border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs font-bold uppercase text-amber-100"
          >
            Probar demo
          </button>
          <button
            type="button"
            disabled={!motion.detection}
            onClick={sendDetection}
            className="border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold uppercase text-slate-300 disabled:opacity-40"
          >
            Enviar senal
          </button>
        </div>
        {motion.error && <p className="text-xs text-red-200">{motion.error}</p>}
        {sendMessage && <p className="text-xs text-cyan-100">{sendMessage}</p>}
        <QuakeSensePreliminaryAlert detection={motion.detection} cluster={lastCluster} />
        {lastCluster && (
          <div className="rounded border border-white/10 bg-slate-900/65 p-3">
            <QuakeSenseClusterBadge cluster={lastCluster} />
            <p className="mt-2 text-xs leading-5 text-slate-300">{lastCluster.argusSummary}</p>
          </div>
        )}
        <p className="rounded border border-amber-300/15 bg-amber-400/8 p-3 text-[0.68rem] leading-5 text-amber-100">
          QuakeSense es opcional. Solo se activa con tu permiso. ARGUS no envia
          audio, camara, identidad ni datos medicos; solo una senal agregada de
          sacudida si se detecta un patron compatible.
        </p>
      </div>
    </aside>
  );
}

function State({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-slate-900/65 p-2">
      <p className="text-[0.55rem] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-slate-200">{value}</p>
    </div>
  );
}
