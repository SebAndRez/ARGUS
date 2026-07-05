import type { VigiaReportType } from "@/modules/vigia/types";
import { vigiaReportTypeLabel } from "@/modules/vigia/utils";

const orderedTypes: VigiaReportType[] = [
  "fire",
  "smoke",
  "earthquake_damage",
  "flood",
  "landslide",
  "road_block",
  "traffic_accident",
  "medical_emergency",
  "public_disorder",
  "infrastructure_damage",
  "power_outage",
  "missing_person_context",
  "animal_risk",
  "other",
];

interface Props {
  value: VigiaReportType;
  onChange: (type: VigiaReportType) => void;
}

export default function VigiaReportTypeSelector({ value, onChange }: Props) {
  return (
    <label className="grid gap-1.5 text-xs text-slate-300">
      Tipo de reporte
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as VigiaReportType)}
        className="border border-white/10 bg-slate-900/90 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/70"
      >
        {orderedTypes.map((type) => (
          <option key={type} value={type}>
            {vigiaReportTypeLabel[type]}
          </option>
        ))}
      </select>
    </label>
  );
}
