"use client";

import type { ArgusLiveCamera } from "@/types/liveCamera";

interface Props {
  camera: ArgusLiveCamera;
  selected?: boolean;
}

export default function LiveCameraMarker({ camera, selected = false }: Props) {
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border font-mono text-[0.62rem] font-bold ${
        selected
          ? "border-cyan-100 bg-cyan-300 text-slate-950"
          : "border-violet-300/40 bg-violet-500/20 text-violet-100"
      }`}
      title={camera.title}
    >
      {camera.markerLabel.slice(0, 4)}
    </span>
  );
}
