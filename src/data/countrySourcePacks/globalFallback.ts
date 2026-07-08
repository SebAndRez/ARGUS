import type { ArgusSourceRegistryEntry } from "@/types/sourceRegistry";

/**
 * Global fallback sources — used by any country pack when no local/official
 * feed is wired yet. These IDs mirror the already-wired feeds in
 * `@/types/ingestion` (`ArgusExternalSourceId`) / `/api/ingest/*`, so
 * `status: "active"` here means genuinely live in this codebase, not
 * aspirational.
 *
 * NASA FIRMS is restricted to `wildfire` coverage on purpose — it detects
 * thermal anomalies/heat signatures only. It must never be treated as a
 * source for rain, floods, landslides or road closures.
 */
export const globalFallbackSources: ArgusSourceRegistryEntry[] = [
  {
    id: "usgs_earthquake",
    name: "USGS Earthquake Hazards Program",
    country: "GLOBAL",
    sourceType: "global_feed",
    coverageDomain: "seismology",
    status: "active",
    reliabilityScore: 90,
    url: "https://earthquake.usgs.gov",
  },
  {
    id: "gdacs",
    name: "GDACS (Global Disaster Alert and Coordination System)",
    country: "GLOBAL",
    sourceType: "global_feed",
    coverageDomain: "global_fallback",
    status: "active",
    reliabilityScore: 82,
    url: "https://www.gdacs.org",
  },
  {
    id: "reliefweb",
    name: "ReliefWeb (OCHA)",
    country: "GLOBAL",
    sourceType: "global_feed",
    coverageDomain: "global_fallback",
    status: "active",
    reliabilityScore: 82,
    url: "https://reliefweb.int",
  },
  {
    id: "nasa_firms",
    name: "NASA FIRMS",
    country: "GLOBAL",
    sourceType: "global_feed",
    coverageDomain: "wildfire",
    status: "active",
    reliabilityScore: 75,
    url: "https://firms.modaps.eosdis.nasa.gov",
    notes:
      "Solo incendios / focos de calor. NO usar como fuente para lluvia, aluviones, inundaciones o remociones en masa.",
  },
  {
    id: "open-meteo",
    name: "Open-Meteo",
    country: "GLOBAL",
    sourceType: "global_feed",
    coverageDomain: "meteorology",
    status: "active",
    reliabilityScore: 60,
    url: "https://open-meteo.com",
    notes: "Contexto meteorológico. No es una fuente de autoridad oficial.",
  },
];
