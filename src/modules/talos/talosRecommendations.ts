import type { TalosModuleRecommendation, TalosRiskAssessment } from "@/modules/talos/types";

const moduleNames: Record<TalosModuleRecommendation["moduleId"], string> = {
  "argus-atlas": "ARGUS ATLAS",
  "argus-vigia": "ARGUS VIGÍA",
  "argus-oraculo": "ARGUS ORÁCULO",
  "argus-hermes": "ARGUS HERMES",
  "argus-arca": "ARGUS ARCA",
  "argus-aura": "ARGUS AURA",
  "argus-nexus": "ARGUS NEXUS",
  "argus-fenix": "ARGUS FÉNIX",
  "argus-custos": "ARGUS CUSTOS",
};

function rec(
  moduleId: TalosModuleRecommendation["moduleId"],
  priority: TalosModuleRecommendation["priority"],
  reason: string,
  requiresRole?: string[]
): TalosModuleRecommendation {
  return { moduleId, moduleName: moduleNames[moduleId], priority, reason, requiresRole };
}

/**
 * Recomendaciones de módulos según categoría/severidad/contexto del
 * evento. CUSTOS nunca se sugiere salvo que el llamador confirme
 * explícitamente que el usuario tiene rol autorizado (`options.userCanUseCustos`).
 * Por defecto, CUSTOS jamás aparece.
 */
export function getTalosModuleRecommendations(
  assessment: TalosRiskAssessment,
  options: { userCanUseCustos?: boolean } = {}
): TalosModuleRecommendation[] {
  const recs: TalosModuleRecommendation[] = [];
  const highOrCritical = assessment.riskLevel === "high" || assessment.riskLevel === "critical";
  const medicalFactor = assessment.factors.find((f) => f.id === "medical" && f.contribution > 0);
  const mobilityFactor = assessment.factors.find((f) => f.id === "mobility" && f.contribution > 0);
  const populationFactor = assessment.factors.find((f) => f.id === "population_exposure" && f.contribution > 0);
  const contradictionPresent = assessment.sourceSummary.contradictionCount > 0;

  if (highOrCritical) {
    recs.push(rec("argus-atlas", assessment.riskLevel === "critical" ? "critical" : "high", "Severidad alta o crítica requiere visibilidad en el centro de mando."));
  }

  switch (assessment.category) {
    case "fire":
      if (medicalFactor) recs.push(rec("argus-aura", "high", "Riesgo médico asociado al incendio (heridos posibles)."));
      if (mobilityFactor) recs.push(rec("argus-hermes", "medium", "Rutas posiblemente afectadas por el foco activo."));
      if (populationFactor) recs.push(rec("argus-arca", "medium", "Posible necesidad de evacuación/refugio."));
      recs.push(rec("argus-nexus", "low", "Podrían requerirse recursos de apoyo (agua, transporte, personal)."));
      if (assessment.riskLevel === "critical" || assessment.escalationLikelihood === "likely" || assessment.escalationLikelihood === "imminent") {
        recs.push(rec("argus-fenix", "medium", "El incendio podría expandirse; útil para simulación futura."));
      }
      break;
    case "earthquake":
      recs.push(rec("argus-hermes", "medium", "Revisar rutas críticas tras el sismo."));
      recs.push(rec("argus-arca", "medium", "Refugios disponibles ante posible daño estructural."));
      recs.push(rec("argus-aura", "medium", "Posible impacto médico por daño estructural."));
      if (assessment.riskLevel === "high" || assessment.riskLevel === "critical") {
        recs.push(rec("argus-fenix", "medium", "Simulación de afectación recomendada para sismos de mayor severidad."));
      }
      break;
    case "flood":
      recs.push(rec("argus-hermes", "medium", "Rutas posiblemente cortadas por anegamiento."));
      recs.push(rec("argus-arca", "medium", "Refugios ante posible evacuación por inundación."));
      recs.push(rec("argus-aura", "low", "Riesgo médico si hay personas atrapadas."));
      recs.push(rec("argus-nexus", "low", "Recursos logísticos para zonas anegadas."));
      break;
    case "traffic":
      recs.push(rec("argus-hermes", "medium", "Rutas alternativas ante accidente vial."));
      recs.push(rec("argus-aura", "medium", "Posible atención médica a heridos."));
      if (assessment.riskLevel === "critical" || (populationFactor && highOrCritical)) {
        recs.push(rec("argus-atlas", "high", "Accidente masivo o crítico requiere coordinación de mando."));
      }
      break;
    case "infrastructure":
      recs.push(rec("argus-hermes", "medium", "Infraestructura dañada puede afectar rutas."));
      recs.push(rec("argus-nexus", "medium", "Recursos de reparación/soporte logístico."));
      break;
    case "public_security":
      if (options.userCanUseCustos) {
        recs.push(
          rec(
            "argus-custos",
            "high",
            "Evento de seguridad pública con posible componente de apoyo policial. Requiere motivo operacional y auditoría.",
            ["police", "authority", "admin", "superadmin"]
          )
        );
      }
      break;
    default:
      break;
  }

  if (contradictionPresent) {
    recs.push(rec("argus-oraculo", "medium", "Evidencia contradictoria requiere validación cruzada adicional."));
  }
  if ((assessment.sourceSummary.vigiaReports ?? 0) === 0 && highOrCritical) {
    recs.push(rec("argus-vigia", "low", "Sin reportes ciudadanos aún; útil monitorear nuevos reportes de la zona."));
  }

  // Deduplicar por moduleId, priorizando la entrada de mayor prioridad.
  const priorityRank = { low: 0, medium: 1, high: 2, critical: 3 };
  const byModule = new Map<string, TalosModuleRecommendation>();
  recs.forEach((entry) => {
    const existing = byModule.get(entry.moduleId);
    if (!existing || priorityRank[entry.priority] > priorityRank[existing.priority]) {
      byModule.set(entry.moduleId, entry);
    }
  });

  return Array.from(byModule.values());
}
