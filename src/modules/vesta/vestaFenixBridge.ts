/**
 * FÉNIX es institucional (simulación de evacuación, rutas críticas y
 * refugios en escenario activo) y hoy no es accesible para el usuario
 * público que usa VESTA. Este bridge queda preparado con la misma forma de
 * datos que usa FÉNIX para que, cuando exista una vía autorizada de
 * consumo público de una ruta/escenario activo, VESTA pueda sugerir la ruta
 * de evacuación y el refugio recomendado sin cambiar su modelo de datos.
 */
export function suggestVestaEvacuationRouteFromFenixScenario(scenario: {
  recommendedPublicRoute?: { name: string; estimatedMinutes: number } | null;
  recommendedShelter?: { name: string } | null;
  publicInstruction?: string;
}) {
  if (!scenario.recommendedPublicRoute && !scenario.recommendedShelter) return null;

  return {
    routeName: scenario.recommendedPublicRoute?.name ?? null,
    estimatedMinutes: scenario.recommendedPublicRoute?.estimatedMinutes ?? null,
    shelterName: scenario.recommendedShelter?.name ?? null,
    instruction: scenario.publicInstruction ?? null,
  };
}
