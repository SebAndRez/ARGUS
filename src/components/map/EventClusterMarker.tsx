import type { EventCluster } from "@/lib/simpleEventClustering";

interface Props {
  cluster: EventCluster;
  isSelected?: boolean;
}

const severityClasses: Record<EventCluster["highestSeverity"], string> = {
  LOW: "border-cyan-100/75 bg-cyan-500 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.35)]",
  MEDIUM: "border-amber-100/75 bg-amber-400 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
  HIGH: "border-orange-100/75 bg-orange-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)]",
  CRITICAL: "border-red-100/80 bg-red-600 text-white shadow-[0_0_22px_rgba(220,38,38,0.45)]",
};

export default function EventClusterMarker({
  cluster,
  isSelected = false,
}: Props) {
  return (
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 font-mono text-xs font-black ${severityClasses[cluster.highestSeverity]} ${
        isSelected ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-slate-950" : ""
      }`}
      aria-hidden="true"
    >
      {cluster.count}
    </div>
  );
}
