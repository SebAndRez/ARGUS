import type { ArgusSourceRegistryEntry } from "@/types/sourceRegistry";

export interface CountrySourcePack {
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  countryName: string;
  sources: ArgusSourceRegistryEntry[];
  notes?: string;
}

export interface CountryMinimumCoverageResult {
  satisfied: boolean;
  missing: string[];
}
