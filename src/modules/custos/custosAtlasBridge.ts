export function getCustosAtlasSummary(custosEvents: Array<{ status?: string; abuseFlag?: boolean }>) {
  return {
    authorizedSearchesActive: custosEvents.length,
    humanitarianStatusesAggregated: custosEvents.reduce<Record<string, number>>((acc, event) => ({ ...acc, [event.status ?? "unknown"]: (acc[event.status ?? "unknown"] ?? 0) + 1 }), {}),
    reviewRequests: custosEvents.filter((event) => event.status === "restricted").length,
    abuseAlerts: custosEvents.filter((event) => event.abuseFlag).length,
    lastUpdated: new Date().toISOString(),
    exactLocationIncluded: false,
  };
}
