export function convertHermesRoutesToFenixRouteInputs(routes: unknown[], blockages: unknown[] = []) {
  return { routes, blockages, confidence: routes.length ? "medium" : "low" };
}
