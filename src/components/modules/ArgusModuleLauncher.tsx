"use client";

import { useState } from "react";
import MobileSafetyPanel from "@/components/mobile-safety/MobileSafetyPanel";
import AuraMedicalPanel from "@/components/medical/AuraMedicalPanel";
import FenixTwinModulePanel from "@/components/modules/FenixTwinModulePanel";
import QuakeSensePanel from "@/components/quakesense/QuakeSensePanel";
import SensorSafetyPanel from "@/components/sensor-safety/SensorSafetyPanel";
import type { MedicalAidRequest } from "@/types/medical";
import type { SafetyCheck } from "@/types/mobileSafety";
import type { QuakeSenseCluster } from "@/types/quakesense";

type ModuleState =
  | "closed"
  | "menu"
  | "fenix"
  | "aura"
  | "quakesense"
  | "safety"
  | "sensorSafety";

interface Props {
  location: { latitude: number; longitude: number };
  onOpen?: () => void;
  onMedicalAidCreated?: (request: MedicalAidRequest) => void;
  onQuakeSenseDemoCluster?: (cluster: QuakeSenseCluster) => void;
  onSafetyCheckCreated?: (check: SafetyCheck) => void;
}

export default function ArgusModuleLauncher({
  location,
  onOpen,
  onMedicalAidCreated,
  onQuakeSenseDemoCluster,
  onSafetyCheckCreated,
}: Props) {
  const [state, setState] = useState<ModuleState>("closed");

  const openState = (next: ModuleState) => {
    onOpen?.();
    setState(next);
  };

  return (
    <>
      <div className="argus-module-launcher pointer-events-auto fixed z-[57]">
        <button
          type="button"
          onClick={() => openState(state === "menu" ? "closed" : "menu")}
          className="argus-module-button"
          aria-expanded={state !== "closed"}
        >
          <span className="grid h-4 w-4 grid-cols-2 gap-0.5">
            <span className="bg-cyan-200" />
            <span className="bg-cyan-200/55" />
            <span className="bg-cyan-200/55" />
            <span className="bg-cyan-200" />
          </span>
          Modulos
        </button>

        {state === "menu" && (
          <div className="argus-module-menu">
            <button
              type="button"
              onClick={() => openState("fenix")}
              className="argus-module-card"
            >
              <span className="text-sm font-semibold text-white">ARGUS Fenix Twin</span>
              <span className="text-[0.65rem] text-slate-400">
                Evacuacion, refugios y simulacion institucional
              </span>
            </button>
            <button
              type="button"
              onClick={() => openState("aura")}
              className="argus-module-card"
            >
              <span className="text-sm font-semibold text-white">AURA Medic Mesh</span>
              <span className="text-[0.65rem] text-slate-400">
                SOS medico, ficha opcional y puntos cercanos
              </span>
            </button>
            <button
              type="button"
              onClick={() => openState("quakesense")}
              className="argus-module-card"
            >
              <span className="text-sm font-semibold text-white">ARGUS QuakeSense</span>
              <span className="text-[0.65rem] text-slate-400">
                Sensor ciudadano sismico experimental
              </span>
            </button>
            <button
              type="button"
              onClick={() => openState("safety")}
              className="argus-module-card"
            >
              <span className="text-sm font-semibold text-white">Mobile Safety Agent</span>
              <span className="text-[0.65rem] text-slate-400">
                Check-in post-sismo y arquitectura movil
              </span>
            </button>
            <button
              type="button"
              onClick={() => openState("sensorSafety")}
              className="argus-module-card"
            >
              <span className="text-sm font-semibold text-white">Sensor Safety</span>
              <span className="text-[0.65rem] text-slate-400">
                Sismos, accidentes, caidas y check-in
              </span>
            </button>
          </div>
        )}
      </div>

      {state === "fenix" && (
        <div className="argus-module-drawer pointer-events-auto fixed z-[60]">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setState("closed")}
              className="border border-white/10 bg-slate-950/85 px-3 py-2 text-xs font-bold uppercase text-slate-300"
            >
              Cerrar
            </button>
          </div>
          <FenixTwinModulePanel onOpenFenix={() => setState("closed")} />
        </div>
      )}

      {state === "aura" && (
        <AuraMedicalPanel
          location={location}
          onClose={() => setState("closed")}
          onMedicalAidCreated={onMedicalAidCreated}
        />
      )}

      {state === "quakesense" && (
        <div className="argus-module-drawer pointer-events-auto fixed z-[60]">
          <QuakeSensePanel
            location={location}
            onClose={() => setState("closed")}
            onDemoCluster={onQuakeSenseDemoCluster}
          />
        </div>
      )}

      {state === "safety" && (
        <div className="argus-module-drawer pointer-events-auto fixed z-[60]">
          <MobileSafetyPanel
            location={location}
            onClose={() => setState("closed")}
            onSafetyCheckCreated={onSafetyCheckCreated}
          />
        </div>
      )}

      {state === "sensorSafety" && (
        <div className="argus-module-drawer pointer-events-auto fixed z-[60]">
          <SensorSafetyPanel
            location={location}
            onClose={() => setState("closed")}
            onSafetyCheckCreated={onSafetyCheckCreated}
          />
        </div>
      )}
    </>
  );
}
