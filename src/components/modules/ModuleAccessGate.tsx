"use client";

import { useState } from "react";
import type { ArgusModuleDefinition, ModuleAccessResult } from "@/types/argusModule";
import { auditModuleAccess } from "@/lib/modules/moduleAccess";
import { custosCaseTypes, type CustosCaseType } from "@/types/custosConsultation";
import ModuleBadge from "@/components/modules/ModuleBadge";

interface Props {
  module: ArgusModuleDefinition;
  access: ModuleAccessResult;
  userRole: string;
  children: React.ReactNode;
}

/**
 * Puerta de acceso genérica para páginas de módulo. Cubre los 3 estados
 * posibles de `canAccessModule`:
 * 1. No visible (`canView: false`) -> el módulo no existe para este rol.
 * 2. Visible pero bloqueado (`canView: true, canEnter: false`) -> mensaje de
 *    bloqueo con el motivo (plan institucional, rol no autorizado, etc).
 * 3. Permitido, pero requiere motivo operacional (CUSTOS y cualquier módulo
 *    futuro con `requiresOperationalReason: true`) -> aviso legal + formulario
 *    de motivo antes de mostrar el contenido.
 * 4. Permitido sin condiciones -> renderiza `children` directamente.
 */
export default function ModuleAccessGate({ module, access, userRole, children }: Props) {
  const [reason, setReason] = useState("");
  const [caseType, setCaseType] = useState<CustosCaseType>(custosCaseTypes[0]);
  const [operationId, setOperationId] = useState("");
  const [granted, setGranted] = useState(false);

  if (!access.canView) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="text-sm text-slate-400">Módulo no disponible para este perfil.</p>
      </div>
    );
  }

  if (!access.canEnter) {
    return (
      <div className="mx-auto max-w-lg border border-white/10 bg-slate-950/85 p-6 text-center shadow-xl shadow-black/30">
        <ModuleBadge label={module.badgeLabel} variant={module.badgeVariant} className="mx-auto" />
        <h2 className="mt-4 text-lg font-semibold text-white">Acceso no disponible</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {access.reason ?? "Este módulo no está disponible para su perfil actual."}
        </p>
      </div>
    );
  }

  if (module.requiresOperationalReason && !granted) {
    const isPoliceOnly = module.accessType === "police_only";

    return (
      <div className="mx-auto max-w-xl border border-red-400/25 bg-slate-950/90 p-6 shadow-xl shadow-black/40">
        <ModuleBadge label="Acceso restringido institucional" variant="danger" />
        <h2 className="mt-4 text-lg font-semibold text-white">
          {module.name} está reservado para personal autorizado
        </h2>
        {isPoliceOnly ? (
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {module.name} está reservado para usuarios policiales o autoridades
            autorizadas. Toda consulta queda auditada. El uso indebido del
            sistema puede generar bloqueo, investigación y reporte
            institucional. Debe existir un motivo operacional válido para
            continuar.
          </p>
        ) : (
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Este módulo requiere justificar el motivo de la consulta antes de
            continuar. La acción quedará auditada.
          </p>
        )}

        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            auditModuleAccess({
              moduleId: module.id,
              userRole,
              action: "ENTER_WITH_REASON",
              reason: `${caseType} · ${operationId || "sin-id"} · ${reason}`,
            });
            setGranted(true);
          }}
        >
          {isPoliceOnly && (
            <label className="grid gap-1 text-xs text-slate-300">
              Tipo de caso
              <select
                value={caseType}
                onChange={(event) => setCaseType(event.target.value as CustosCaseType)}
                className="border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white"
              >
                {custosCaseTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isPoliceOnly && (
            <label className="grid gap-1 text-xs text-slate-300">
              Identificador de operación
              <input
                value={operationId}
                onChange={(event) => setOperationId(event.target.value)}
                placeholder="N° de parte, causa o folio"
                className="border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder:text-slate-600"
              />
            </label>
          )}
          <label className="grid gap-1 text-xs text-slate-300">
            Motivo de la consulta
            <textarea
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Describa el motivo operacional de esta consulta"
              className="border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder:text-slate-600"
            />
          </label>
          <button
            type="submit"
            className="mt-1 min-h-10 border border-red-300/30 bg-red-500/15 px-3 text-xs font-bold uppercase tracking-[0.1em] text-red-100 transition hover:bg-red-500/25"
          >
            Confirmar motivo y continuar
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
