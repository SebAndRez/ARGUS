import { knowledgeSourceRegistry } from "@/data/knowledgeSourceRegistry";
import type {
  ArgusHazardDomain,
  ArgusKnowledgeLicenseType,
  ArgusKnowledgeSource,
  ArgusKnowledgeSourceStatus,
} from "@/types/knowledgeIntake";
import type {
  OraculoCommercialUseStatus,
  OraculoReliabilityTier,
  OraculoSource,
  OraculoSourceCategory,
  OraculoSourceStatus,
  OraculoSourceType,
} from "@/modules/oraculo/types";

/**
 * ORÁCULO no reescribe el registro de fuentes de ARGUS: reutiliza
 * `src/data/knowledgeSourceRegistry.ts` (ya usado por Knowledge Intake) y lo
 * adapta a su propio vocabulario de confiabilidad/licencia. Esto evita tener
 * dos catálogos de fuentes desincronizados.
 */

function domainToCategory(domains: ArgusHazardDomain[]): OraculoSourceCategory {
  if (domains.some((d) => d.includes("earthquake"))) return "earthquake";
  if (domains.some((d) => d === "tsunami" || d.includes("tsunami"))) return "tsunami";
  if (domains.some((d) => d.includes("volcano") || d === "ashfall")) return "volcano";
  if (domains.some((d) => d.includes("wildfire") || d.includes("fire"))) return "wildfire";
  if (domains.some((d) => d.includes("flood") || d.includes("hydrology"))) return "flood";
  if (domains.some((d) => d.includes("weather") || d.includes("forecast") || d.includes("storm") || d.includes("hurricane"))) return "weather";
  if (domains.some((d) => d.includes("humanitarian"))) return "humanitarian";
  if (domains.some((d) => d.includes("conflict") || d === "civil_unrest")) return "conflict";
  if (domains.some((d) => d.includes("infrastructure") || d.includes("power_grid") || d.includes("telecom")))
    return "infrastructure";
  return "other";
}

function statusToOraculo(status: ArgusKnowledgeSourceStatus): OraculoSourceStatus {
  switch (status) {
    case "active":
    case "active_contextual":
    case "active_historical":
    case "active_institutional":
      return "active";
    case "disabled":
      return "disabled";
    case "requiresReview":
      return "manual_review";
    case "requiresApiKey":
    case "requiresConfiguration":
    case "planned":
    case "stub":
      return "planned";
    case "manual":
      return "manual_review";
    default:
      return "planned";
  }
}

function scoreToTier(finalScore: number): OraculoReliabilityTier {
  if (finalScore >= 90) return "tier_1_official";
  if (finalScore >= 75) return "tier_2_institutional";
  if (finalScore >= 60) return "tier_3_verified_osint";
  if (finalScore >= 40) return "tier_4_media";
  if (finalScore > 0) return "tier_5_citizen";
  return "unknown";
}

function licenseToCommercialUse(licenseType: ArgusKnowledgeLicenseType): OraculoCommercialUseStatus {
  switch (licenseType) {
    case "openAccess":
    case "publicDomain":
    case "requiresAttribution":
      return "allowed";
    case "nonCommercial":
    case "nonCommercialFree":
    case "restricted":
      return "restricted";
    case "manualReviewRequired":
      return "requires_review";
    case "unknown":
    default:
      return "unknown";
  }
}

function inferSourceType(knowledgeSource: ArgusKnowledgeSource): OraculoSourceType {
  const name = knowledgeSource.name.toLowerCase();
  if (name.includes("gdelt")) return "media";
  if (knowledgeSource.sourceKinds.includes("citizen")) return "citizen";
  if (["gdacs", "reliefweb", "who", "wmo"].some((token) => name.includes(token))) return "international_organization";
  if (name.includes("usgs") || name.includes("nws") || name.includes("noaa") || name.includes("nasa")) return "government";
  return "official";
}

function mapKnowledgeSourceToOraculo(knowledgeSource: ArgusKnowledgeSource): OraculoSource {
  return {
    id: knowledgeSource.id,
    name: knowledgeSource.name,
    shortName: knowledgeSource.name.split(" ")[0],
    category: domainToCategory(knowledgeSource.domains),
    sourceType: inferSourceType(knowledgeSource),
    description: knowledgeSource.description,
    homepage: knowledgeSource.baseUrl,
    status: statusToOraculo(knowledgeSource.status),
    reliabilityTier: scoreToTier(knowledgeSource.reliabilityScore.finalScore),
    updateFrequency: knowledgeSource.updateCadence,
    coverage: knowledgeSource.coverage.global ? "global" : knowledgeSource.coverage.countries?.length ? "national" : "regional",
    requiresApiKey: knowledgeSource.status === "requiresApiKey",
    requiresLicenseReview: ["nonCommercial", "nonCommercialFree", "restricted", "manualReviewRequired", "unknown"].includes(
      knowledgeSource.licenseType
    ),
    commercialUseStatus: licenseToCommercialUse(knowledgeSource.licenseType),
    attributionRequired: knowledgeSource.licenseType === "requiresAttribution",
    notes: knowledgeSource.licenseNotes,
  };
}

const CURATED_KNOWLEDGE_SOURCE_IDS = ["usgs_earthquake", "open-meteo", "reliefweb", "gdacs", "gdelt", "nws"];

const curatedFromKnowledgeRegistry: OraculoSource[] = CURATED_KNOWLEDGE_SOURCE_IDS.map((id) => {
  const found = knowledgeSourceRegistry.find((entry) => entry.id === id);
  return found ? mapKnowledgeSourceToOraculo(found) : null;
}).filter((entry): entry is OraculoSource => entry !== null);

/**
 * Fuentes internas de ARGUS (no vienen del registro de Knowledge Intake) y
 * fuentes externas planeadas pero aún no integradas (sin API real ni clave
 * configurada) — declaradas explícitamente como `planned`/`manual_review`
 * para no simular una conexión que no existe.
 */
const additionalSources: OraculoSource[] = [
  {
    id: "argus-vigia-reports",
    name: "ARGUS VIGÍA",
    shortName: "VIGÍA",
    category: "citizen_report",
    sourceType: "internal",
    description: "Reportes ciudadanos verificados recolectados por el módulo VIGÍA.",
    status: "active",
    reliabilityTier: "tier_5_citizen",
    coverage: "national",
    requiresApiKey: false,
    requiresLicenseReview: false,
    commercialUseStatus: "allowed",
    attributionRequired: false,
    notes: "Confiabilidad individual depende de reputación del reportante y evidencia adjunta.",
  },
  {
    id: "argus-core-events",
    name: "ARGUS Core Events",
    shortName: "ARGUS Core",
    category: "institutional",
    sourceType: "internal",
    description: "Eventos e incidentes internos de la plataforma (reportes, SOS, alertas).",
    status: "active",
    reliabilityTier: "tier_2_institutional",
    coverage: "national",
    requiresApiKey: false,
    requiresLicenseReview: false,
    commercialUseStatus: "allowed",
    attributionRequired: false,
  },
  {
    id: "csn-chile",
    name: "CSN Chile (Centro Sismológico Nacional)",
    shortName: "CSN",
    category: "earthquake",
    sourceType: "government",
    description: "Autoridad sismológica oficial de Chile. Integración futura, aún no conectada.",
    status: "planned",
    reliabilityTier: "unknown",
    coverage: "national",
    requiresApiKey: true,
    requiresLicenseReview: true,
    commercialUseStatus: "unknown",
    attributionRequired: true,
    notes: "Sin conector activo todavía; requiere revisión de acceso/API oficial.",
  },
  {
    id: "emsc",
    name: "EMSC (European-Mediterranean Seismological Centre)",
    shortName: "EMSC",
    category: "earthquake",
    sourceType: "international_organization",
    description: "Boletines sísmicos europeos/mediterráneos. Opcional a futuro.",
    status: "planned",
    reliabilityTier: "unknown",
    coverage: "regional",
    requiresApiKey: false,
    requiresLicenseReview: true,
    commercialUseStatus: "unknown",
    attributionRequired: true,
  },
  {
    id: "wmo",
    name: "WMO (World Meteorological Organization)",
    shortName: "WMO",
    category: "weather",
    sourceType: "international_organization",
    description: "Marco meteorológico internacional de referencia. Sin API directa integrada aún.",
    status: "planned",
    reliabilityTier: "unknown",
    coverage: "global",
    requiresApiKey: false,
    requiresLicenseReview: true,
    commercialUseStatus: "unknown",
    attributionRequired: true,
  },
  {
    id: "liveuamap",
    name: "Liveuamap",
    shortName: "Liveuamap",
    category: "conflict",
    sourceType: "media",
    description: "Mapa de eventos de conflicto/crisis con curaduría manual. Requiere revisión de licencia de uso.",
    status: "manual_review",
    reliabilityTier: "tier_4_media",
    coverage: "global",
    requiresApiKey: false,
    requiresLicenseReview: true,
    commercialUseStatus: "requires_review",
    attributionRequired: true,
    notes: "Ingesta manual/semiautomatizada solamente; no hay conector automático habilitado.",
  },
  {
    id: "acled",
    name: "ACLED",
    shortName: "ACLED",
    category: "conflict",
    sourceType: "academic",
    description: "Base de datos de conflicto armado y protesta. Requiere licencia/acceso pago.",
    status: "disabled",
    reliabilityTier: "unknown",
    coverage: "global",
    requiresApiKey: true,
    requiresLicenseReview: true,
    commercialUseStatus: "restricted",
    attributionRequired: true,
    notes: "Deshabilitado hasta contar con licencia/acceso comercial aprobado.",
  },
];

export const oraculoSourceRegistry: OraculoSource[] = [...additionalSources, ...curatedFromKnowledgeRegistry];

export function getOraculoSourceById(id: string) {
  return oraculoSourceRegistry.find((source) => source.id === id) ?? null;
}
