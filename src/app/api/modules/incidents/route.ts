import { NextRequest, NextResponse } from "next/server";
import { getModuleIncidentListContext } from "@/lib/modules/moduleOperationalContext";
import type { CanonicalLifecycle, CanonicalSeverity, ModuleVerificationStatus, OperationalContextModuleId } from "@/types/moduleOperationalContext";
import type { ArgusEventType } from "@/types/argusEvent";

export const dynamic = "force-dynamic";

/**
 * ARGUS Prompt 17 — endpoint compartido de lectura para
 * ATLAS/VIGÍA/ORÁCULO/TALOS (`Opción B`, Prompt 17 §8: los cuatro son
 * dashboards de cliente y necesitan una API). Un solo endpoint en vez de
 * cuatro rutas paralelas — cada módulo pasa `?module=argus-<slug>` para que
 * el permiso se resuelva server-side contra el registro de módulos ya
 * existente, nunca contra el rol leído en el cliente.
 */

const VALID_MODULE_IDS: OperationalContextModuleId[] = ["argus-atlas", "argus-vigia", "argus-oraculo", "argus-talos"];

function parseListParam<T extends string>(value: string | null): T[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean) as T[];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const moduleId = params.get("module") as OperationalContextModuleId | null;
  if (!moduleId || !VALID_MODULE_IDS.includes(moduleId)) {
    return NextResponse.json(
      { state: "unavailable", error: { code: "INVALID_INCIDENT_ID", message: "Parámetro ?module= requerido y debe ser uno de los cuatro módulos soportados." } },
      { status: 400 }
    );
  }

  const limitParam = params.get("limit");
  const context = await getModuleIncidentListContext(moduleId, {
    lifecycle: parseListParam<CanonicalLifecycle>(params.get("lifecycle")),
    severity: parseListParam<CanonicalSeverity>(params.get("severity")),
    verificationStatus: parseListParam<ModuleVerificationStatus>(params.get("verificationStatus")),
    type: parseListParam<ArgusEventType>(params.get("type")),
    countryCode: params.get("countryCode") ?? undefined,
    regionCode: params.get("regionCode") ?? undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    source: params.get("source") ?? undefined,
    limit: limitParam ? Number(limitParam) : undefined,
    cursor: params.get("cursor"),
    includeDemo: params.get("includeDemo") === "true",
  });

  return NextResponse.json(context, { status: statusForContext(context.state, "error" in context ? context.error.code : undefined) });
}

function statusForContext(state: string, errorCode: string | undefined): number {
  if (state === "available" || state === "empty" || state === "degraded" || state === "insufficient_data") return 200;
  if (state === "unauthorized") return errorCode === "FORBIDDEN" ? 403 : 401;
  if (errorCode === "INCIDENT_NOT_FOUND") return 404;
  if (errorCode === "INVALID_INCIDENT_ID") return 400;
  return 502;
}
