export function prepareCustosOperationalRouteRequest(context: { authorized: boolean; destinationLabel: string; reasonId?: string }) {
  if (!context.authorized) return null;
  return { destination: { label: context.destinationLabel, isApproximate: true }, reasonId: context.reasonId, routePurpose: "authorized_operational_support", sensitiveRoute: true };
}
