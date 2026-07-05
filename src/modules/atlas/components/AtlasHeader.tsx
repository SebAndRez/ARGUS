"use client";

import { useEffect, useState } from "react";
import type { ArgusRole } from "@/types/rbac";

interface Props {
  userRole: ArgusRole;
  isDemoData: boolean;
  criticalCount: number;
}

export default function AtlasHeader({ userRole, isDemoData, criticalCount }: Props) {
  const [now, setNow] = useState<Date | null>(() => (typeof window === "undefined" ? null : new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const globalStatus = criticalCount > 0 ? "Crítico" : "Operativo";

  return (
    <header className="border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur-xl sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-cyan-300">
            Centro de mando operacional
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em] text-white">
            ARGUS ATLAS
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] ${
              criticalCount > 0
                ? "border-red-400/40 bg-red-500/12 text-red-100"
                : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            Estado: {globalStatus}
          </span>
          <span className="inline-flex items-center border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300">
            {now
              ? now.toLocaleString("es-CL", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })
              : "--:--"}
          </span>
          <span className="inline-flex items-center border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
            Rol: {userRole}
          </span>
          {isDemoData && (
            <span className="inline-flex items-center border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
              Datos demo
            </span>
          )}
          <a
            href="/modules"
            className="inline-flex items-center border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"
          >
            ← Módulos
          </a>
        </div>
      </div>

      {criticalCount > 0 && (
        <p className="mt-3 border border-red-400/25 bg-red-500/8 px-3 py-2 text-xs font-semibold text-red-100">
          {criticalCount} evento(s) crítico(s) requieren atención inmediata.
        </p>
      )}
    </header>
  );
}
