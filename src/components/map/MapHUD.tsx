"use client";

import { useEffect, useState } from "react";

interface Props {
  gpsStatus: string;
}

export default function MapHUD({ gpsStatus }: Props) {
  const [currentTime, setCurrentTime] = useState("--:--");

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Intl.DateTimeFormat("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date())
      );
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-40 w-[calc(100%-2rem)] -translate-x-1/2 rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-[0.8rem] text-slate-200 shadow-xl shadow-black/30 backdrop-blur-xl sm:w-[calc(100%-4rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">ARGUS GRID</p>
          <p className="text-sm font-semibold text-white">Modo operativo geoespacial</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-full bg-white/5 px-3 py-1">GPS: {gpsStatus}</span>
          <span className="rounded-full bg-white/5 px-3 py-1">{currentTime}</span>
        </div>
      </div>
    </div>
  );
}
