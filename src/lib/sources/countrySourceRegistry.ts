/**
 * Country Source Registry — aggregates `CountrySourcePack`s (official +
 * technical + news + OSINT sources classified by `ArgusSourceType` and
 * governance status) plus the shared global-fallback list.
 *
 * This is a different concern from the sibling registries already in the
 * codebase, kept intentionally separate rather than merged into them:
 * - `@/lib/sources/sourceRegistry.ts` — operational health/reliability view
 *   of the already-wired automated ingestion feeds (USGS, GDACS, ...).
 * - `@/config/argusSourceRegistry.ts` — tier/priority scheduling config for
 *   those same automated feeds, keyed to `ArgusExternalSourceId`.
 * - `@/data/conflictSourceRegistry.ts` — conflict-zone specific sources.
 *
 * This registry is the one with per-country coverage and the
 * official-vs-news attribution governance (`ArgusSourceType`) required by
 * the ARGUS Event standard — see `@/types/argusEvent`.
 */

import type { CountrySourcePack } from "@/types/countrySourcePack";
import type { ArgusSourceRegistryEntry, ArgusSourceEntryStatus } from "@/types/sourceRegistry";
import { chileSourcePack } from "@/data/countrySourcePacks/chile";
import { globalFallbackSources } from "@/data/countrySourcePacks/globalFallback";

/** Every registered `CountrySourcePack`. Chile is the pilot. */
export const countrySourcePacks: CountrySourcePack[] = [chileSourcePack];

export function getCountrySourcePack(countryCode: string): CountrySourcePack | undefined {
  const normalized = countryCode.toUpperCase();
  return countrySourcePacks.find((pack) => pack.countryCode === normalized);
}

export function getGlobalFallbackSources(): ArgusSourceRegistryEntry[] {
  return globalFallbackSources;
}

export function getSourcesByCountry(countryCode: string): ArgusSourceRegistryEntry[] {
  return getCountrySourcePack(countryCode)?.sources ?? [];
}

export function getAllCountrySources(): ArgusSourceRegistryEntry[] {
  return [
    ...countrySourcePacks.flatMap((pack) => pack.sources),
    ...globalFallbackSources,
  ];
}

export interface CountrySourceFilters {
  country?: string;
  status?: ArgusSourceEntryStatus;
  coverageDomain?: string;
}

export function filterCountrySources(filters: CountrySourceFilters): ArgusSourceRegistryEntry[] {
  return getAllCountrySources().filter((source) => {
    if (filters.country && source.country.toUpperCase() !== filters.country.toUpperCase()) {
      return false;
    }
    if (filters.status && source.status !== filters.status) return false;
    if (filters.coverageDomain && source.coverageDomain !== filters.coverageDomain) return false;
    return true;
  });
}
