"use client";

import { useState } from "react";
import BlackBoxCard from "@/components/sensor-safety/BlackBoxCard";
import DeadManSwitchCard from "@/components/sensor-safety/DeadManSwitchCard";
import FallSenseCard from "@/components/sensor-safety/FallSenseCard";
import MobileNotificationPreview from "@/components/sensor-safety/MobileNotificationPreview";
import RoadSenseCard from "@/components/sensor-safety/RoadSenseCard";
import RouteGuardianCard from "@/components/sensor-safety/RouteGuardianCard";
import SafetyCheckBlockingModal from "@/components/sensor-safety/SafetyCheckBlockingModal";
import ProductStatusBadge from "@/components/status/ProductStatusBadge";
import ExperimentalNotice from "@/components/status/ExperimentalNotice";
import type { SafetyCheck } from "@/types/mobileSafety";
import type {
  SensorSafetyCheckIn,
  SensorSafetyResponse,
} from "@/types/sensorSafety";

interface Props {
  location: { latitude: number; longitude: number };
  onClose: () => void;
  onSafetyCheckCreated?: (check: SafetyCheck) => void;
}

export default function SensorSafetyPanel({
  onClose,
  onSafetyCheckCreated,
}: Props) {
  const [activeCheckIn, setActiveCheckIn] = useState<SensorSafetyCheckIn | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [allowLocation, setAllowLocation] = useState(true);
  const [allowEscalation, setAllowEscalation] = useState(true);

  const runDemo = async (scenario: string) => {
    const response = await fetch("/api/sensor-safety/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    const payload = await response.json();
    if (payload.checkIn) {
      setActiveCheckIn(payload.checkIn);
      onSafetyCheckCreated?.(toMobileSafetyCheck(payload.checkIn));
    }
    setMessage("Deteccion preliminar demo creada. Pendiente de Safety Check.");
  };

  const respond = async (safetyResponse: SensorSafetyResponse) => {
    if (!activeCheckIn) return;
    const response = await fetch("/api/sensor-safety/check-ins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeCheckIn.id, response: safetyResponse }),
    });
    const payload = await response.json();
    if (payload.checkIn) {
      setActiveCheckIn(payload.checkIn);
      onSafetyCheckCreated?.(toMobileSafetyCheck(payload.checkIn));
      setMessage(`Respuesta registrada: ${safetyResponse}.`);
      if (safetyResponse === "I_AM_SAFE" || safetyResponse === "FALSE_ALARM") {
        setActiveCheckIn(null);
      }
    }
  };

  const escalate = async () => {
    if (!activeCheckIn) return;
    const response = await fetch("/api/sensor-safety/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeCheckIn.id }),
    });
    const payload = await response.json();
    if (payload.checkIn) {
      setActiveCheckIn(payload.checkIn);
      onSafetyCheckCreated?.(toMobileSafetyCheck(payload.checkIn));
      setMessage("Usuario no responde: alerta preliminar demo escalada.");
    }
  };

  return (
    <>
      <aside className="argus-module-panel max-h-[calc(100svh-1rem)] overflow-y-auto">
        <header className="argus-module-panel-header">
          <div>
            <div className="flex flex-wrap gap-1.5">
              <ProductStatusBadge kind="EXPERIMENTAL" />
              <ProductStatusBadge kind="RUNTIME_ONLY" />
              <ProductStatusBadge kind="FUTURE" />
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">
              ARGUS Sensor Safety Suite
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Sismos, accidentes, caidas y check-in.
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
            Las funciones always-on requieren app movil nativa. En web/PWA esto
            es una simulacion o modo limitado. No reemplaza servicios de
            emergencia ni fuentes oficiales.
          </ExperimentalNotice>

          <div className="grid gap-2 text-xs text-slate-300">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              Activar modo safety demo.
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allowLocation} onChange={(event) => setAllowLocation(event.target.checked)} />
              Permitir ubicacion aproximada en emergencia.
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allowEscalation} onChange={(event) => setAllowEscalation(event.target.checked)} />
              Permitir escalacion por no respuesta.
            </label>
          </div>

          <MobileNotificationPreview />
          <RoadSenseCard onDemo={() => enabled && runDemo("road_crash")} />
          <FallSenseCard onDemo={() => enabled && runDemo("hard_fall")} />
          <RouteGuardianCard onDemo={() => enabled && runDemo("route_stop")} />
          <DeadManSwitchCard onDemo={() => enabled && allowEscalation && runDemo("dead_man_no_response")} />
          <BlackBoxCard />

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => runDemo("rollover")} className="argus-safety-demo-button">
              Simular volcamiento
            </button>
            <button type="button" onClick={escalate} disabled={!activeCheckIn || !allowEscalation} className="argus-safety-demo-button disabled:opacity-40">
              Simular no respuesta
            </button>
          </div>

          {!allowLocation && (
            <p className="text-xs text-slate-500">
              Ubicacion aproximada desactivada en UI demo. Los eventos no deben
              exponer ubicacion precisa sin consentimiento.
            </p>
          )}
          {message && <p className="text-xs leading-5 text-cyan-100">{message}</p>}
        </div>
      </aside>

      <SafetyCheckBlockingModal
        checkIn={activeCheckIn}
        eventLabel="posible accidente, caida, sacudida o check-in de ruta"
        onRespond={respond}
        onClose={() => setActiveCheckIn(null)}
      />
    </>
  );
}

function toMobileSafetyCheck(checkIn: SensorSafetyCheckIn): SafetyCheck {
  return {
    id: checkIn.id,
    userId: "sensor-safety-demo",
    triggerEventId: checkIn.detectionId,
    status:
      checkIn.status === "USER_SAFE"
        ? "USER_SAFE"
        : checkIn.status === "NEED_HELP"
          ? "USER_NEEDS_HELP"
          : checkIn.status === "INJURED"
            ? "USER_INJURED"
            : checkIn.status === "TRAPPED"
              ? "USER_TRAPPED"
              : checkIn.status === "ESCALATED"
                ? "ESCALATED"
                : checkIn.status === "NO_RESPONSE"
                  ? "NO_RESPONSE"
                  : "NOTIFIED",
    createdAt: checkIn.createdAt,
    notificationSentAt: checkIn.createdAt,
    timeoutSeconds: Math.max(
      30,
      Math.round((new Date(checkIn.deadlineAt).getTime() - Date.now()) / 1000)
    ),
    lastApproxLat: checkIn.approximateLat,
    lastApproxLng: checkIn.approximateLng,
    lastAccuracyBand: checkIn.accuracyBand,
    emergencyContactsNotified: checkIn.status === "ESCALATED",
    commandCenterVisible: true,
    missingPersonCandidate:
      checkIn.status === "ESCALATED" && checkIn.missingPersonCandidateAllowed,
    notes:
      "Sensor Safety Suite demo. Deteccion preliminar, pendiente de confirmacion.",
    isDemo: true,
  };
}
