import type { HermesAtlasSummary, HermesBlockage, HermesRoute } from "@/modules/hermes/types";

/**
 * Resumen tipado que ATLAS podrá consumir como panel de movilidad. No se
 * conecta automáticamente aquí — solo se prepara el dato.
 */
export function getHermesAtlasSummary(routes: HermesRoute[], blockages: HermesBlockage[]): HermesAtlasSummary {
  const availableRoutes = routes.filter((r) => r.status === "available").length;
  const blockedRoutes = routes.filter((r) => r.status === "blocked").length;
  const criticalBlockages = blockages.filter((b) => b.severity === "critical" && b.status !== "cleared").length;
  const activeEvacuationRoutes = routes.filter((r) => r.purpose === "evacuation" && r.status !== "blocked").length;
  const availableMedicalRoutes = routes.filter((r) => r.purpose === "medical_access" && r.status !== "blocked").length;
  const affectedLogisticsRoutes = routes.filter(
    (r) => r.purpose === "logistics_delivery" && (r.status === "blocked" || r.status === "high_risk")
  ).length;

  const purposeGroups = new Map<string, HermesRoute[]>();
  routes.forEach((route) => {
    const key = route.purpose;
    purposeGroups.set(key, [...(purposeGroups.get(key) ?? []), route]);
  });
  let zonesWithoutAlternative = 0;
  purposeGroups.forEach((group) => {
    if (group.every((route) => route.status === "blocked" || route.status === "high_risk")) {
      zonesWithoutAlternative += 1;
    }
  });

  const timestamps = [...routes.map((r) => r.updatedAt), ...blockages.map((b) => b.updatedAt)].sort();

  return {
    availableRoutes,
    blockedRoutes,
    criticalBlockages,
    activeEvacuationRoutes,
    availableMedicalRoutes,
    affectedLogisticsRoutes,
    zonesWithoutAlternative,
    lastUpdatedIso: timestamps.at(-1) ?? null,
  };
}
