import { demoNavRoutes } from "@/data/routingIntelligenceDemo";
import type { ArgusNavRoute, VehicleProfile } from "@/types/routing";

export async function getMockRoutes(input: {
  origin: [number, number];
  destination: [number, number];
  vehicleProfile: VehicleProfile;
}): Promise<ArgusNavRoute[]> {
  const [originLat, originLng] = input.origin;
  const [destinationLat, destinationLng] = input.destination;

  return demoNavRoutes.map((route, index) => ({
    ...route,
    vehicleProfile: input.vehicleProfile,
    coordinates:
      index === 0
        ? [input.origin, ...route.coordinates, input.destination]
        : [
            [originLat, originLng],
            ...route.coordinates.slice(0, 2),
            [destinationLat, destinationLng],
          ],
  }));
}
