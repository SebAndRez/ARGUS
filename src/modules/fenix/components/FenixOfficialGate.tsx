"use client";

import { useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import { getModuleById } from "@/data/argusModules";
import { canAccessModule, mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import { auditFenixAction } from "@/modules/fenix/fenixAudit";
import ModuleAccessGate from "@/components/modules/ModuleAccessGate";
import LegalNoticeBanner from "@/components/legal/LegalNoticeBanner";
import FenixTwinPanel from "@/components/fenix/FenixTwinPanel";

const FENIX_MODULE_ID = "argus-fenix";

/**
 * ARGUS v1.0.3.4 — canonical entry point for FÉNIX (see
 * docs/modules/ARGUS_FENIX_CANONICALIZATION.md). Renders the more mature
 * implementation (`FenixTwinPanel`, backed by `/api/fenix/simulation` and
 * `runFenixSimulation`) instead of the largely-simulated `FenixDashboard`.
 *
 * Access is resolved EXCLUSIVELY from the real session role
 * (`mapSessionUserToArgusRole`) through the same central policy used
 * everywhere else (`canAccessModule`, src/lib/modules/moduleAccess.ts) —
 * no `localStorage`, no query parameter, no client-side override can ever
 * substitute for it (Prompt 5 policy, unchanged here).
 */
export default function FenixOfficialGate() {
  const { user, loading } = useSession();
  const moduleDef = getModuleById(FENIX_MODULE_ID);
  const sessionRole = mapSessionUserToArgusRole(user);
  const access = moduleDef
    ? canAccessModule(sessionRole, moduleDef)
    : { canView: false, canEnter: false, reason: "Módulo no encontrado." };

  useEffect(() => {
    if (loading || !moduleDef) return;
    auditFenixAction({
      userId: user?.id,
      userRole: sessionRole,
      action: "module_view",
      reason: access.canEnter ? "fenix_official_gate_opened" : "fenix_official_gate_denied",
    });
    // Only log once per resolved role/access pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleDef?.id, sessionRole, access.canEnter, loading]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Cargando ARGUS FÉNIX...
      </main>
    );
  }

  if (!moduleDef) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-sm text-slate-400">Módulo no encontrado.</p>
      </main>
    );
  }

  return (
    <ModuleAccessGate module={moduleDef} access={access} userRole={sessionRole}>
      <div className="p-4">
        <LegalNoticeBanner />
      </div>
      <FenixTwinPanel />
    </ModuleAccessGate>
  );
}
