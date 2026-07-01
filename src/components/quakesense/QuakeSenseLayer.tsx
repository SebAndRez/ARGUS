"use client";

import QuakeSenseClusterBadge from "@/components/quakesense/QuakeSenseClusterBadge";
import type { QuakeSenseCluster } from "@/types/quakesense";

interface Props {
  clusters: QuakeSenseCluster[];
}

export default function QuakeSenseLayer({ clusters }: Props) {
  if (clusters.length === 0) return null;

  return (
    <section className="rounded border border-cyan-300/20 bg-slate-950/85 p-3">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
        Sacudida ciudadana
      </p>
      <div className="mt-2 grid gap-2">
        {clusters.slice(0, 3).map((cluster) => (
          <QuakeSenseClusterBadge key={cluster.id} cluster={cluster} />
        ))}
      </div>
    </section>
  );
}
