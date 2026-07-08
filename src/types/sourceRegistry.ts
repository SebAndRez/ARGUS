import type { ArgusSourceType } from "@/types/argusEvent";

/**
 * Lifecycle of a registry entry — most Chile entries start as
 * `requires_parser`/`manual` because ARGUS knows the source exists and is
 * authoritative, but no ingestion job has been wired for it yet. Only
 * sources with a real, already-wired feed in this codebase are `active`.
 */
export type ArgusSourceEntryStatus =
  | "active"
  | "manual"
  | "planned"
  | "requires_parser"
  | "requires_api_key"
  | "disabled";

export type ArgusSourceCoverageDomain =
  | "emergency_management"
  | "meteorology"
  | "seismology"
  | "volcanology_geology"
  | "tsunami_coastal"
  | "roads_transport"
  | "hydrology_rivers"
  | "wildfire"
  | "national_news"
  | "regional_news"
  | "global_fallback";

export interface ArgusSourceRegistryEntry {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2, or "GLOBAL" for world-fallback sources. */
  country: string;
  sourceType: ArgusSourceType;
  coverageDomain: ArgusSourceCoverageDomain;
  status: ArgusSourceEntryStatus;
  /** 0-100. */
  reliabilityScore: number;
  /** For regional media: which macro-zone/region it actually covers. */
  region?: string;
  url?: string;
  notes?: string;
  /** 1 = primary/authoritative official source for its domain, 2/3 = secondary or supplementary. */
  tier?: 1 | 2 | 3;
  trustLevel?: "high" | "medium" | "low";
  /** The institution ARGUS attributes this source to when consumed directly (Caso A). */
  authority?: string;
  /** Expected feed refresh cadence, in minutes. */
  updateFrequencyMinutes?: number;
  /** Free-text description of what this source is good for, e.g. "alertas vigentes, eventos activos". */
  useCase?: string;
}
