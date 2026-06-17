"use client";

import type { CrisisEvent } from "@/types/crisis";

interface Props {
  events: CrisisEvent[];
  gpsStatus: string;
}

export default function DashboardTopBar({ events, gpsStatus }: Props) {
  const activeCount = events.filter((event) => event.status !== "RESOLVED").length;
  const criticalCount = events.filter((event) => event.severity === "CRITICAL").length;
  const sosCount = events.filter((event) => event.type === "SOS").length;

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 px-6 py-4 backdrop-blur-xl">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">Centro de mando</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">ARGUS GRID</h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
            <p className="text-[0.68rem] uppercase tracking-[0.3em] text-slate-500">Eventos activos</p>
            <p className="mt-2 text-2xl font-semibold text-white">{activeCount}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
            <p className="text-[0.68rem] uppercase tracking-[0.3em] text-slate-500">Críticos</p>
            <p className="mt-2 text-2xl font-semibold text-red-400">{criticalCount}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
            <p className="text-[0.68rem] uppercase tracking-[0.3em] text-slate-500">SOS</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-300">{sosCount}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
        <span className="rounded-2xl bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.22em]">GPS: {gpsStatus}</span>
        <span className="rounded-2xl bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.22em]">{new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </header>
  );
}
