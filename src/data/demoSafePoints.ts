import type { OfflineCrisisPack, SafePoint } from "@/types/routing";

const updatedAt = "2026-06-26T00:00:00.000Z";

export const demoSafePoints: SafePoint[] = [
  {
    id: "safe-high-ground-san-cristobal",
    name: "Zona alta Cerro San Cristobal",
    type: "high_ground",
    status: "operational",
    coordinates: [-33.4254, -70.6337],
    capacityLevel: "medium",
    communicationsAvailable: true,
    lastUpdatedAt: updatedAt,
    source: "demo",
    notes: "Punto alto demo para evacuacion referencial.",
  },
  {
    id: "safe-shelter-estadio",
    name: "Refugio demo Estadio Nacional",
    type: "shelter",
    status: "limited",
    coordinates: [-33.4645, -70.6107],
    capacityLevel: "high",
    powerAvailable: true,
    waterAvailable: true,
    medicalSupport: true,
    communicationsAvailable: true,
    lastUpdatedAt: updatedAt,
    source: "demo",
  },
  {
    id: "safe-supply-la-florida",
    name: "Centro de acopio La Florida",
    type: "supply_center",
    status: "operational",
    coordinates: [-33.5224, -70.5981],
    capacityLevel: "medium",
    waterAvailable: true,
    lastUpdatedAt: updatedAt,
    source: "demo",
  },
];

export const demoOfflineCrisisPacks: OfflineCrisisPack[] = [
  {
    id: "offline-santiago-oriente",
    name: "Pack Santiago Oriente",
    regionName: "Santiago Oriente",
    bounds: { north: -33.34, south: -33.61, east: -70.45, west: -70.75 },
    includesMaps: true,
    includesSafePoints: true,
    includesEvacuationRoutes: true,
    includesHospitals: true,
    includesShelters: true,
    includesEmergencyContacts: true,
    sizeMb: 180,
    status: "not_downloaded",
  },
];
