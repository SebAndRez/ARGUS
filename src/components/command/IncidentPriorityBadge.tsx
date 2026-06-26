import type { IncidentPriority } from "@/types/incident";

const classes: Record<IncidentPriority, string> = {
  P0_CRITICAL: "border-red-300/35 bg-red-500/15 text-red-100",
  P1_HIGH: "border-orange-300/35 bg-orange-500/12 text-orange-100",
  P2_MEDIUM: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  P3_LOW: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  P4_INFO: "border-slate-300/20 bg-slate-400/10 text-slate-300",
};

export default function IncidentPriorityBadge({ priority }: { priority: IncidentPriority }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[0.56rem] font-bold uppercase ${classes[priority]}`}>
      {priority.replace("_", " ")}
    </span>
  );
}
