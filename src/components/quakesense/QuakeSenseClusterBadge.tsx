import type { QuakeSenseCluster } from "@/types/quakesense";

const severityClass: Record<QuakeSenseCluster["severity"], string> = {
  isolated: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  low: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  medium: "border-orange-300/30 bg-orange-500/10 text-orange-100",
  high: "border-red-300/35 bg-red-500/15 text-red-100",
};

export default function QuakeSenseClusterBadge({
  cluster,
}: {
  cluster: QuakeSenseCluster;
}) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[0.56rem] font-bold uppercase ${severityClass[cluster.severity]}`}>
      {cluster.isDemo ? "DEMO " : ""}
      {cluster.signalCount} senales
    </span>
  );
}
