"use client";

import { useState } from "react";
import AuraMedicalPanel from "@/components/medical/AuraMedicalPanel";
import FenixTwinModulePanel from "@/components/modules/FenixTwinModulePanel";
import type { MedicalAidRequest } from "@/types/medical";

type ModuleState = "closed" | "menu" | "fenix" | "aura";

interface Props {
  location: { latitude: number; longitude: number };
  onOpen?: () => void;
  onMedicalAidCreated?: (request: MedicalAidRequest) => void;
}

export default function ArgusModuleLauncher({
  location,
  onOpen,
  onMedicalAidCreated,
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
    </>
  );
}
