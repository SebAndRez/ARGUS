import type { RouteGuardianStatus } from "@/types/sensorSafety";

export type RouteGuardianState = {
  routeId: string;
  startedAt: string;
  expectedArrivalAt: string;
  lastMovementAt?: string;
  distanceFromRouteMeters: number;
  status: RouteGuardianStatus;
};

export function startRouteGuardian(routePlan: { routeId: string; etaMinutes: number }) {
  const now = Date.now();
  return {
    routeId: routePlan.routeId,
    startedAt: new Date(now).toISOString(),
    expectedArrivalAt: new Date(now + routePlan.etaMinutes * 60_000).toISOString(),
    distanceFromRouteMeters: 0,
    status: "ACTIVE" as RouteGuardianStatus,
  };
}

export function detectUnexpectedStop(routeState: RouteGuardianState) {
  if (!routeState.lastMovementAt) return false;
  return Date.now() - new Date(routeState.lastMovementAt).getTime() > 10 * 60_000;
}

export function detectRouteDeviation(routeState: RouteGuardianState) {
  return routeState.distanceFromRouteMeters > 300;
}

export function evaluateRouteProgress(routeState: RouteGuardianState) {
  if (detectRouteDeviation(routeState)) return "DEVIATED" as RouteGuardianStatus;
  if (detectUnexpectedStop(routeState)) return "STOPPED_UNEXPECTEDLY" as RouteGuardianStatus;
  if (new Date(routeState.expectedArrivalAt).getTime() < Date.now()) {
    return "DELAYED" as RouteGuardianStatus;
  }
  return routeState.status;
}

export function buildRouteGuardianCheckIn(routeState: RouteGuardianState) {
  return {
    routeId: routeState.routeId,
    reason:
      evaluateRouteProgress(routeState) === "DEVIATED"
        ? "Desvio de ruta segura demo."
        : "Detencion anormal de ruta demo.",
  };
}
