import type { FenixShelter, FenixShelterStatus } from "@/types/fenix";
import type {
  ArcaCapacityStatus,
  ArcaConfidence,
  ArcaServiceStatus,
  ArcaShelter,
  ArcaShelterStatus,
} from "@/modules/arca/types";

/**
 * ARCA reads the same real shelters FÉNIX already serves
 * (`/api/fenix/shelters?lat&lng` → `CriticalPoi` + operational status). This
 * adapter never invents data: anything the source did not report stays
 * "unknown"/absent, and operator contact details are not surfaced publicly.
 */

const STATUS: Record<FenixShelterStatus, ArcaShelterStatus> = {
  available: "active",
  near_capacity: "limited",
  full: "full",
  closed: "closed",
  compromised: "limited",
  unknown: "unknown",
};

const CAPACITY_STATUS: Record<FenixShelterStatus, ArcaCapacityStatus> = {
  available: "available",
  near_capacity: "near_full",
  full: "full",
  closed: "unknown",
  compromised: "unknown",
  unknown: "unknown",
};

function service(value: boolean | undefined): ArcaServiceStatus {
  if (value === true) return "available";
  if (value === false) return "unavailable";
  return "unknown";
}

function flag(value: boolean | undefined): boolean | "unknown" {
  return value === undefined ? "unknown" : value;
}

function confidence(score: number | undefined): ArcaConfidence {
  if (score === undefined || !Number.isFinite(score) || score <= 0) return "unknown";
  if (score >= 85) return "verified";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export function fenixShelterToArcaShelter(shelter: FenixShelter): ArcaShelter {
  const [lat, lng] = shelter.coordinates;
  const total = shelter.capacity;
  const occupancy = shelter.currentOccupancy;
  const stamp = shelter.lastVerifiedAt ?? new Date(0).toISOString();
  return {
    id: shelter.id,
    name: shelter.name,
    type: "public_shelter",
    status: STATUS[shelter.status] ?? "unknown",
    capacityStatus: CAPACITY_STATUS[shelter.status] ?? "unknown",
    location: {
      lat,
      lng,
      label: shelter.address,
      isApproximate: shelter.locationAccuracy !== undefined && shelter.locationAccuracy !== "precise",
    },
    addressLabel: shelter.address,
    operator: shelter.operatorName ? { name: shelter.operatorName, type: "unknown" } : undefined,
    capacity: {
      total,
      currentOccupancy: occupancy,
      available: total !== undefined && occupancy !== undefined ? Math.max(0, total - occupancy) : undefined,
      lastUpdatedAt: shelter.lastVerifiedAt,
      isEstimated: total === undefined,
    },
    services: {
      water: service(shelter.waterAvailable),
      food: service(shelter.hasFood),
      electricity: service(shelter.powerAvailable),
      bathrooms: service(shelter.hasBathrooms),
      showers: service(shelter.hasShowers),
      heating: service(shelter.hasHeating),
      internet: service(shelter.hasConnectivity),
      phoneCharging: "unknown",
      medicalPoint: service(shelter.medicalSupport),
      psychologicalSupport: "unknown",
      security: "unknown",
      childFriendlyArea: "unknown",
      petFriendly: service(shelter.allowsPets),
    },
    accessibility: {
      wheelchairAccessible: flag(shelter.isAccessible),
      reducedMobilitySupport: flag(shelter.isAccessible),
      elderlySupport: "unknown",
      childSupport: "unknown",
      petSupport: flag(shelter.allowsPets),
      vehicleAccess: shelter.routeStatus === "blocked" ? false : "unknown",
      publicTransportAccess: "unknown",
    },
    needs: [],
    linkedReports: [],
    linkedTalosAssessments: [],
    linkedHermesRoutes: [],
    linkedEvidence: [],
    confidence: confidence(shelter.confidence),
    createdAt: stamp,
    updatedAt: stamp,
    isDemo: false,
    isPublic: true,
  };
}
