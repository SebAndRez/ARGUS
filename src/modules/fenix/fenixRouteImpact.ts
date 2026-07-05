import type { FenixRouteImpact, FenixScenario } from "@/modules/fenix/types";

export function calculateFenixRouteImpacts(scenario: FenixScenario, hermesRoutes: unknown[] = scenario.inputs.hermesRoutes ?? []): FenixRouteImpact[] {
  if (!hermesRoutes.length) {
    return [{ routeName: "Rutas HERMES no disponibles", status: "unknown", impactLevel: "medium", reason: "Falta informacion de rutas para estimar saturacion." }];
  }
  return [
    { routeName: "Ruta Norte demo", status: "likely_congested", estimatedSaturationMinutes: scenario.inputs.evacuationWindowMinutes ? Math.max(12, Math.round(scenario.inputs.evacuationWindowMinutes * 0.4)) : undefined, impactLevel: "high", reason: "Podria saturarse por concentracion de evacuacion y bloqueo parcial reportado." },
    { routeName: "Alternativa HERMES B", status: "strained", impactLevel: "medium", reason: "Evaluar como alternativa; requiere confirmacion de campo." },
  ];
}
