import { demoSafePoints } from "@/data/demoSafePoints";
import type { ConvoyPlan } from "@/types/routing";

export function createDemoConvoy(): ConvoyPlan {
  return {
    id: "convoy-demo-1",
    name: "Convoy ayuda municipal demo",
    leaderVehicleId: "convoy-veh-1",
    routeId: "ri-ruta-oriente",
    status: "planned",
    vehicles: [
      {
        id: "convoy-veh-1",
        name: "Lider convoy",
        vehicleProfile: "pickup",
        status: "on_route",
        lastKnownLocation: [-33.4489, -70.6693],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        id: "convoy-veh-2",
        name: "Apoyo logistico",
        vehicleProfile: "aid_logistics",
        status: "delayed",
        lastKnownLocation: [-33.456, -70.655],
        lastUpdatedAt: new Date().toISOString(),
      },
    ],
    rallyPoints: [
      {
        id: "rally-1",
        name: "Punto reunion seguro",
        coordinates: [-33.4645, -70.6107],
        purpose: "regroup",
      },
    ],
    safeStops: demoSafePoints,
  };
}

export function detectConvoyIssues(plan: ConvoyPlan) {
  return plan.vehicles
    .filter((vehicle) => vehicle.status === "delayed" || vehicle.status === "off_route")
    .map((vehicle) => ({
      vehicleId: vehicle.id,
      message: `${vehicle.name} requiere verificacion de posicion o punto de reunion.`,
    }));
}
