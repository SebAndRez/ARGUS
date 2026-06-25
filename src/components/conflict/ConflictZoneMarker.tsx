import type { ConflictRiskLevel } from "@/types/conflictZone";

interface Props {
  riskLevel: ConflictRiskLevel;
  label?: string;
}

const riskClass: Record<ConflictRiskLevel, string> = {
  low: "border-cyan-300 bg-cyan-400/15 text-cyan-100",
  medium: "border-amber-300 bg-amber-400/15 text-amber-100",
  high: "border-orange-300 bg-orange-500/15 text-orange-100",
  critical: "border-red-300 bg-red-500/20 text-red-100",
};

export default function ConflictZoneMarker({ riskLevel, label = "CZ" }: Props) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[0.58rem] font-black ${riskClass[riskLevel]}`}
    >
      {label}
    </span>
  );
}
