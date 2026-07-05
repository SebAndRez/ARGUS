import type { FenixActionPlanItem, FenixScenario } from "@/modules/fenix/types";

export function generateFenixActionPlan(scenario: FenixScenario): FenixActionPlanItem[] {
  return [
    { id: `${scenario.id}-atlas`, priority: "high", module: "ATLAS", action: "Evaluar activacion de monitoreo ATLAS del escenario.", reason: "Consolidar vista de mando y eventos relacionados.", requiresHumanApproval: true },
    { id: `${scenario.id}-hermes`, priority: "high", module: "HERMES", action: "Revisar rutas HERMES alternativas y puntos de bloqueo.", reason: "Reducir dependencia de rutas con posible saturacion.", requiresHumanApproval: true },
    { id: `${scenario.id}-arca`, priority: "medium", module: "ARCA", action: "Preparar monitoreo de capacidad ARCA y refugios alternativos.", reason: "La demanda estimada podria tensionar refugios.", requiresHumanApproval: true },
    { id: `${scenario.id}-nexus`, priority: "medium", module: "NEXUS", action: "Preparar suministros NEXUS de agua, combustible y mantas.", reason: "Brechas logisticas estimadas con datos demo.", requiresHumanApproval: true },
    { id: `${scenario.id}-oraculo`, priority: "medium", module: "ORACULO", action: "Solicitar validacion ORACULO de evidencia y contradicciones.", reason: "La confianza depende de fuentes verificadas.", requiresHumanApproval: true },
  ];
}
