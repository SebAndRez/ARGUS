export function convertNexusDataToFenixResourceInputs(resources: unknown[], needs: unknown[], dispatches: unknown[]) {
  return { resources, needs, dispatches, aggregatedOnly: true };
}
