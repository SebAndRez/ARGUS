"use client";

import { useState } from "react";
import { useSession } from "@/hooks/useSession";
import { getSortedModules } from "@/data/argusModules";
import {
  DEMO_ROLE_STORAGE_KEY,
  canAccessModule,
  mapSessionUserToArgusRole,
} from "@/lib/modules/moduleAccess";
import type { ArgusRole } from "@/types/rbac";
import ModuleCard from "@/components/modules/ModuleCard";

const demoRoleOptions: { value: ArgusRole; label: string }[] = [
  { value: "PUBLIC", label: "Usuario público" },
  { value: "CITIZEN", label: "Usuario común" },
  { value: "VERIFIED_CITIZEN", label: "Usuario verificado" },
  { value: "ANALYST", label: "Analista" },
  { value: "INSTITUTIONAL_ADMIN", label: "Institución" },
  { value: "MEDICAL_OPERATOR", label: "Médico / emergencia médica" },
  { value: "OPERATOR", label: "Emergencia / respondedor" },
  { value: "LOGISTICS", label: "Logística" },
  { value: "POLICE", label: "Policía" },
  { value: "AUTHORITY", label: "Autoridad" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Superadmin" },
];

const modules = getSortedModules();

export default function ModulesMenu() {
  const { user, loading } = useSession();
  const [override, setOverride] = useState<ArgusRole | "">(() => {
    if (typeof window === "undefined") return "";
    try {
      return (window.localStorage.getItem(DEMO_ROLE_STORAGE_KEY) as ArgusRole) || "";
    } catch {
      return "";
    }
  });

  function updateOverride(role: ArgusRole | "") {
    setOverride(role);
    try {
      if (role) {
        window.localStorage.setItem(DEMO_ROLE_STORAGE_KEY, role);
      } else {
        window.localStorage.removeItem(DEMO_ROLE_STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable, ignore
    }
  }

  const sessionRole = mapSessionUserToArgusRole(user);
  const effectiveRole = override || sessionRole;
  const visibleModules = modules.filter(
    (module) => canAccessModule(effectiveRole, module).canView
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-white/10 pb-6">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-cyan-300">
            ARGUS Core + módulos verticales
          </p>
          <h1 className="mt-2 text-2xl font-bold uppercase tracking-[0.06em]">Módulos ARGUS</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Cada módulo vive sobre ARGUS Core (mapa, SOS, reportes, alertas,
            reputación y auditoría). Visibilidad y acceso dependen del rol
            institucional.
          </p>
        </header>

        <div className="mt-4 flex flex-wrap items-center gap-3 border border-white/10 bg-white/[0.02] p-3">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            Rol de prueba (solo para validar visibilidad):
            <select
              value={override}
              onChange={(event) => updateOverride(event.target.value as ArgusRole | "")}
              className="border border-white/10 bg-slate-900/80 px-2 py-1.5 text-xs text-white"
            >
              <option value="">
                {loading ? "Cargando sesión..." : `Usar mi sesión (${sessionRole})`}
              </option>
              {demoRoleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[0.65rem] text-slate-500">
            Rol efectivo actual: <strong className="text-cyan-200">{effectiveRole}</strong>
          </span>
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
              access={canAccessModule(effectiveRole, module)}
            />
          ))}
        </section>

        {visibleModules.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-500">
            No hay módulos visibles para este rol.
          </p>
        )}
      </div>
    </main>
  );
}
