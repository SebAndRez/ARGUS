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
  /** When true, the trigger button renders without fixed positioning (for use inside a positioned container) */
  embedded?: boolean;
}

const publicModules: Array<{
  state: Extract<ModuleState, "fenix" | "aura">;
  title: string;
  description: string;
}> = [
  {
    state: "fenix",
    title: "ARGUS Fenix Twin",
    description: "Evacuacion, refugios y simulacion institucional",
  },
  {
    state: "aura",
    title: "AURA Medic Mesh",
    description: "SOS medico, ficha opcional y puntos cercanos",
  },
];

export default function ArgusModuleLauncher({
  location,
  onOpen,
  onMedicalAidCreated,
  onQuakeSenseDemoCluster,
  onSafetyCheckCreated,
  embedded = false,
}: Props) {
  const [state, setState] = useState<ModuleState>("closed");

  const openState = (next: ModuleState) => {
    onOpen?.();
    setState(next);
  };

  // When embedded, the launcher wrapper is relative (no fixed) so the button
  // sits inside the parent orbit-right-topbar container. The dropdown menu and
  // panels remain fixed so they overlay the full screen correctly.
  const launcherClass = embedded
    ? "argus-module-launcher-embedded pointer-events-auto relative"
    : "argus-module-launcher pointer-events-auto fixed z-[57]";

  return (
    <>
      <div className={launcherClass}>
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
            {publicModules.map((module) => (
              <button
                key={module.state}
                type="button"
                onClick={() => openState(module.state)}
                className="argus-module-card"
              >
                <span className="text-sm font-semibold text-white">
                  {module.title}
                </span>
                <span className="text-[0.65rem] text-slate-400">
                  {module.description}
                </span>
              </button>
            ))}
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
