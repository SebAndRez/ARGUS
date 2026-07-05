import type { HermesMobilityMode, HermesRoutePurpose } from "@/modules/hermes/types";
import { hermesMobilityModeLabel, hermesPurposeLabel } from "@/modules/hermes/utils";

const minimalModes: HermesMobilityMode[] = ["walking", "car", "motorcycle", "bicycle", "ambulance", "logistics_truck", "four_by_four"];
const minimalPurposes: HermesRoutePurpose[] = [
  "safe_navigation",
  "evacuation",
  "medical_access",
  "shelter_access",
  "logistics_delivery",
  "emergency_response",
];

interface Props {
  mode: HermesMobilityMode;
  onModeChange: (mode: HermesMobilityMode) => void;
  purpose: HermesRoutePurpose;
  onPurposeChange: (purpose: HermesRoutePurpose) => void;
}

export default function HermesMobilityModeSelector({ mode, onModeChange, purpose, onPurposeChange }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-xs text-slate-300">
        Modo de movilidad
        <select
          value={mode}
          onChange={(event) => onModeChange(event.target.value as HermesMobilityMode)}
          className="border border-white/10 bg-slate-900/90 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-400/70"
        >
          {minimalModes.map((option) => (
            <option key={option} value={option}>
              {hermesMobilityModeLabel[option]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs text-slate-300">
        Propósito de la ruta
        <select
          value={purpose}
          onChange={(event) => onPurposeChange(event.target.value as HermesRoutePurpose)}
          className="border border-white/10 bg-slate-900/90 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-400/70"
        >
          {minimalPurposes.map((option) => (
            <option key={option} value={option}>
              {hermesPurposeLabel[option]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
