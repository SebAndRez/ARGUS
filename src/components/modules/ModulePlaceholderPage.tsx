"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { getModuleById } from "@/data/argusModules";
import {
  DEMO_ROLE_STORAGE_KEY,
  auditModuleAccess,
  canAccessModule,
  mapSessionUserToArgusRole,
} from "@/lib/modules/moduleAccess";
import type { ArgusRole } from "@/types/rbac";
import ModuleAccessGate from "@/components/modules/ModuleAccessGate";
import ModulePlaceholder from "@/components/modules/ModulePlaceholder";

interface Props {
  moduleId: string;
}

function readDemoRole(): ArgusRole | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(DEMO_ROLE_STORAGE_KEY);
    return (stored as ArgusRole) || null;
  } catch {
    return null;
  }
}

/**
 * Componente compartido que resuelve rol efectivo + acceso + auditoría para
 * cualquier página `/modules/<slug>`. Cada `page.tsx` de módulo solo importa
 * esto y le pasa su `moduleId`.
 */
export default function ModulePlaceholderPage({ moduleId }: Props) {
  const { user } = useSession();
  const [demoRole] = useState<ArgusRole | null>(() => readDemoRole());

  const moduleDef = getModuleById(moduleId);
  const effectiveRole: ArgusRole = demoRole ?? mapSessionUserToArgusRole(user);
  const access = moduleDef
    ? canAccessModule(effectiveRole, moduleDef)
    : { canView: false, canEnter: false, reason: "Módulo no encontrado." };

  useEffect(() => {
    if (!moduleDef || !moduleDef.requiresAudit) return;
    auditModuleAccess({
      moduleId: moduleDef.id,
      userRole: effectiveRole,
      action: access.canEnter ? "VIEW" : "VIEW_DENIED",
      reason: access.reason,
    });
    // Only log once per resolved role/module pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleDef?.id, effectiveRole, access.canEnter]);

  if (!moduleDef) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-sm text-slate-400">Módulo no encontrado.</p>
      </main>
    );
  }

  return (
    <ModuleAccessGate module={moduleDef} access={access} userRole={effectiveRole}>
      <ModulePlaceholder module={moduleDef} />
    </ModuleAccessGate>
  );
}
