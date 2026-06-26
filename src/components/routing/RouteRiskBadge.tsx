import type { RouteRiskLevel } from "@/types/routing";

const classes: Record<RouteRiskLevel, string> = {
  low: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  medium: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  high: "border-orange-300/30 bg-orange-500/10 text-orange-100",
  critical: "border-red-300/35 bg-red-500/15 text-red-100",
};

export default function RouteRiskBadge({ risk }: { risk: RouteRiskLevel }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[0.56rem] font-bold uppercase ${classes[risk]}`}>
      Riesgo {risk}
    </span>
  );
}
