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
    <div className="argus-hud pointer-events-none fixed left-1/2 top-4 z-40 flex w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 flex-col gap-3 rounded-3xl border bg-slate-950/95 px-4 py-3 text-[0.82rem] text-slate-200 shadow-xl shadow-black/30 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="grid gap-1">
        <p className="text-[0.65rem] uppercase tracking-[0.32em] text-cyan-300/80">ARGUS GRID</p>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">LIVE OPS</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-300">
          <p className="text-[0.65rem] text-slate-400">GPS</p>
          <p className="mt-1 font-semibold text-white">{gpsStatus}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-300">
          <p className="text-[0.65rem] text-slate-400">RED</p>
          <p className="mt-1 font-semibold text-cyan-300">ONLINE</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-300">
          <p className="text-[0.65rem] text-slate-400">HORA</p>
          <p className="mt-1 font-semibold text-white">{currentTime}</p>
        </div>
      </div>
    </div>
  );
}
