import type { CustosAccessLevel, CustosPersonSearchResult } from "@/modules/custos/types";

export function redactCustosResultForAccessLevel(result: CustosPersonSearchResult, accessLevel: CustosAccessLevel): CustosPersonSearchResult {
  if (accessLevel === "none") {
    return { ...result, displayName: "Restringido", alias: undefined, approximateAgeRange: undefined, identityHash: undefined, lastKnownContext: undefined, visibility: "redacted", allowedActions: [], warnings: ["Acceso denegado."] };
  }
  if (["case_search", "restricted_view"].includes(accessLevel)) {
    return {
      ...result,
      identityHash: undefined,
      lastKnownContext: result.lastKnownContext
        ? { ...result.lastKnownContext, locationLabel: result.lastKnownContext.locationApproximate ? result.lastKnownContext.locationLabel : "Ubicacion protegida", locationApproximate: true }
        : undefined,
      visibility: result.visibility === "sensitive" ? "redacted" : result.visibility,
      warnings: [...result.warnings, "Vista minima/protegida. Ubicacion exacta no disponible por defecto."],
    };
  }
  return { ...result, warnings: [...result.warnings, "Acceso auditado; no incluye datos medicos personales."] };
}
