"use client";

import type { QuakeSenseCluster } from "@/types/quakesense";

interface Props {
  cluster: QuakeSenseCluster;
}

export default function QuakeSenseMarker({ cluster }: Props) {
  return (
    <div className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-cyan-200/45 bg-cyan-400/20 px-2 text-[0.62rem] font-black text-cyan-50 shadow-lg shadow-cyan-950/40">
      QS {cluster.signalCount}
    </div>
  );
}
