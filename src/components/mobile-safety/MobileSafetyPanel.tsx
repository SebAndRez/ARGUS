"use client";

import { useMemo, useState } from "react";
import MobileNotificationPreview from "@/components/mobile-safety/MobileNotificationPreview";
import SafetyCheckBlockingModal from "@/components/mobile-safety/SafetyCheckBlockingModal";
import ProductStatusBadge from "@/components/status/ProductStatusBadge";
import ExperimentalNotice from "@/components/status/ExperimentalNotice";
import type { SafetyCheck } from "@/types/mobileSafety";

interface Props {
  location: { latitude: number; longitude: number };
  onClose: () => void;
  onSafetyCheckCreated?: (check: SafetyCheck) => void;
}

export default function MobileSafetyPanel({
  location,
  onClose,
  onSafetyCheckCreated,
}: Props) {
  const [enabled, setEnabled] = useState(true);
  const [shareApproxLocation, setShareApproxLocation] = useState(true);
  const [allowEscalation, setAllowEscalation] = useState(true);
  const [checkInTimeoutSeconds, setCheckInTimeoutSeconds] = useState(90);
  const [activeCheck, setActiveCheck] = useState<SafetyCheck | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const statusLabel = useMemo(() => {
    if (!enabled) return "Desactivado";
    if (activeCheck?.status === "USER_SAFE") return "Usuario seguro";
    if (activeCheck?.status === "USER_NEEDS_HELP") return "Ayuda solicitada";
    if (activeCheck?.status === "ESCALATED") return "Escalado demo";
    if (activeCheck) return "Check-in abierto";
    return "Listo para demo";
  }, [activeCheck, enabled]);

  const createCheck = async () => {
    if (!enabled) {
      setMessage("Safety Agent esta desactivado.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile-safety/quake-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: shareApproxLocation ? location.latitude : undefined,
          longitude: shareApproxLocation ? location.longitude : undefined,
          accuracyBand: shareApproxLocation ? "district" : "none",
          confidence: 72,
          peakAcceleration: 15.1,
          networkStatus: "online",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.reason ?? payload.error);
      setActiveCheck(payload.check);
      onSafetyCheckCreated?.(payload.check);
      setMessage("Check-in demo creado. Pendiente de respuesta manual.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear check-in.");
    } finally {
      setLoading(false);
    }
  };

  const updateCheck = async (responseValue: "I_AM_SAFE" | "NEED_HELP") => {
    if (!activeCheck) return;
    const response = await fetch("/api/mobile-safety/check-in", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeCheck.id, response: responseValue }),
    });
    const payload = await response.json();
    if (payload.check) {
      setActiveCheck(payload.check);
      onSafetyCheckCreated?.(payload.check);
    }
  };

  const escalate = async () => {
    if (!activeCheck || !allowEscalation) return;
    const response = await fetch("/api/mobile-safety/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: activeCheck.id,
        reason: "Demo: sin respuesta en ventana de check-in.",
      }),
    });
    const payload = await response.json();
    if (payload.check) {
      setActiveCheck(payload.check);
      onSafetyCheckCreated?.(payload.check);
      setMessage("Escalamiento demo registrado. No se enviaron notificaciones reales.");
    }
  };

  return (
    <>
      <aside className="argus-module-panel max-h-[calc(100svh-1rem)] overflow-y-auto">
        <header className="argus-module-panel-header">
          <div>
            <div className="flex flex-wrap gap-1.5">
              <ProductStatusBadge kind="DEMO" />
              <ProductStatusBadge kind="RUNTIME_ONLY" />
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Mobile Safety Agent
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Check-in post-sismo y arquitectura futura nativa.
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
            Mobile Safety Agent esta en modo demo/runtime. No envia push real,
            no opera en segundo plano y no contacta servicios de emergencia.
          </ExperimentalNotice>
          <MobileNotificationPreview
            title="ARGUS Safety Check"
            body="Posible sacudida detectada. Confirma si estas bien."
            status={activeCheck?.status === "USER_NEEDS_HELP" ? "critical" : "warning"}
          />

          <div className="grid grid-cols-2 gap-2 text-xs">
            <State label="Modo" value={enabled ? "Demo activo" : "Pausado"} />
            <State label="Estado" value={statusLabel} />
            <State label="Timeout" value={`${checkInTimeoutSeconds}s`} />
            <State label="Plataforma" value="Web/PWA demo" />
          </div>

          <div className="grid gap-2 text-xs text-slate-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Habilitar agente demo.
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shareApproxLocation}
                onChange={(event) => setShareApproxLocation(event.target.checked)}
              />
              Usar ubicacion aproximada solo en emergencia.
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowEscalation}
                onChange={(event) => setAllowEscalation(event.target.checked)}
              />
              Permitir escalamiento demo al centro de mando.
            </label>
            <label className="grid gap-1">
              <span className="text-[0.6rem] font-bold uppercase text-slate-500">
                Ventana de respuesta
              </span>
              <input
                type="number"
                min={30}
                max={600}
                value={checkInTimeoutSeconds}
                onChange={(event) =>
                  setCheckInTimeoutSeconds(
                    Math.min(600, Math.max(30, Number(event.target.value) || 90))
                  )
                }
                className="border border-white/10 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={createCheck}
              disabled={loading}
              className="border border-violet-300/25 bg-violet-400/12 px-3 py-2 text-xs font-bold uppercase text-violet-100 disabled:opacity-50"
            >
              Simular sacudida
            </button>
            <button
              type="button"
              onClick={escalate}
              disabled={!activeCheck || !allowEscalation}
              className="border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs font-bold uppercase text-amber-100 disabled:opacity-40"
            >
              Escalar demo
            </button>
            <button
              type="button"
              disabled={!activeCheck}
              onClick={() => updateCheck("I_AM_SAFE")}
              className="border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs font-bold uppercase text-emerald-100 disabled:opacity-40"
            >
              Estoy bien
            </button>
            <button
              type="button"
              disabled={!activeCheck}
              onClick={() => updateCheck("NEED_HELP")}
              className="border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs font-bold uppercase text-red-100 disabled:opacity-40"
            >
              Necesito ayuda
            </button>
          </div>

          {message && <p className="text-xs leading-5 text-cyan-100">{message}</p>}

          {activeCheck && (
            <div className="rounded border border-white/10 bg-slate-900/65 p-3 text-xs text-slate-300">
              <p className="font-semibold text-white">Check {activeCheck.id}</p>
              <p className="mt-1">Estado: {activeCheck.status}</p>
              <p>Centro de mando: {activeCheck.commandCenterVisible ? "visible" : "oculto"}</p>
              <p>
                Candidato desaparicion:{" "}
                {activeCheck.missingPersonCandidate ? "si" : "no"}
              </p>
            </div>
          )}

          <p className="rounded border border-violet-300/15 bg-violet-400/8 p-3 text-[0.68rem] leading-5 text-violet-100">
            Esta fase documenta una arquitectura futura para Android/iOS. En web
            no hay acelerometro en segundo plano, critical alerts ni push real.
          </p>
        </div>
      </aside>

      <SafetyCheckBlockingModal
        check={
          activeCheck?.status === "NOTIFIED" || activeCheck?.status === "OPENED"
            ? activeCheck
            : null
        }
        onSafe={() => updateCheck("I_AM_SAFE")}
        onNeedHelp={() => updateCheck("NEED_HELP")}
        onClose={() => setActiveCheck(null)}
      />
    </>
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
