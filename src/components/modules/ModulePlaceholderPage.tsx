"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { getModuleById } from "@/data/argusModules";
import {
  DEMO_ROLE_STORAGE_KEY,
  auditModuleAccess,
  canAccessModule,
  clearDemoRoleOverride,
  isDemoRoleOverrideAllowed,
  mapSessionUserToArgusRole,
  resolveEffectiveModuleRole,
} from "@/lib/modules/moduleAccess";
import type { ArgusRole } from "@/types/rbac";
import ModuleAccessGate from "@/components/modules/ModuleAccessGate";
import ModulePlaceholder from "@/components/modules/ModulePlaceholder";

interface Props {
  moduleId: string;
}

function readDemoRole(): ArgusRole | null {
  if (typeof window === "undefined" || !isDemoRoleOverrideAllowed()) return null;
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
 *
 * ARGUS v1.0.3.4 — este es el gate de acceso REAL (no solo de presentación
 * de menú) para cualquier módulo que use esta página compartida (hoy:
 * NEXUS). Antes, un valor de `localStorage` sobrescribía directamente el
 * rol de sesión aquí (`demoRole ?? mapSessionUserToArgusRole(user)`), lo
 * que permitía a cualquier usuario forzar `POLICE`/`AUTHORITY`/
 * `INSTITUTIONAL_ADMIN`/etc. y superar `canAccessModule` sin una sesión de
 * servidor real. `resolveEffectiveModuleRole` solo permite esa sustitución
 * cuando `isDemoRoleOverrideAllowed()` es verdadero (nunca en producción).
 */
export default function ModulePlaceholderPage({ moduleId }: Props) {
  const { user } = useSession();
  const allowOverride = isDemoRoleOverrideAllowed();
  const [demoRole] = useState<ArgusRole | null>(() => readDemoRole());

  // Defense in depth: a user can land directly on this route without ever
  // visiting `/modules` first, so this page must independently wipe any
  // stale override key rather than relying on ModulesMenu having run.
  useEffect(() => {
    if (!allowOverride) clearDemoRoleOverride();
  }, [allowOverride]);

  const moduleDef = getModuleById(moduleId);
  const sessionRole = mapSessionUserToArgusRole(user);
  const effectiveRole: ArgusRole = resolveEffectiveModuleRole(sessionRole, demoRole);
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
