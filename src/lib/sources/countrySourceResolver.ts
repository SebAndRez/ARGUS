import type { CountryMinimumCoverageResult, CountrySourcePack } from "@/types/countrySourcePack";
import type { ArgusSourceCoverageDomain } from "@/types/sourceRegistry";
import { getCountrySourcePack } from "@/lib/sources/countrySourceRegistry";

export function resolveCountrySourcePack(countryCode: string): CountrySourcePack | undefined {
  return getCountrySourcePack(countryCode);
}

/**
 * ARGUS minimum coverage rule per country: at least one national emergency
 * authority, one meteorological authority, one seismic/geological authority
 * (where applicable), one roads/transport authority, one water/coastal
 * authority (where applicable), 3+ trusted national outlets, and 3+ regional
 * outlets. Domains that don't apply to a given country (e.g. landlocked ->
 * no tsunami_coastal) should simply not be required — this generic check
 * only enforces the domains actually present as "expected" via the
 * `requiredDomains` parameter so it stays reusable for future country packs.
 */
const DEFAULT_REQUIRED_DOMAINS: Array<{
  domain: ArgusSourceCoverageDomain;
  minCount: number;
  label: string;
}> = [
  { domain: "emergency_management", minCount: 1, label: "fuente nacional oficial de emergencias" },
  { domain: "meteorology", minCount: 1, label: "fuente meteorológica oficial" },
  { domain: "roads_transport", minCount: 1, label: "fuente vial/transporte oficial" },
  { domain: "national_news", minCount: 3, label: "medios nacionales confiables" },
  { domain: "regional_news", minCount: 3, label: "medios regionales" },
];

export function validateMinimumCoverage(
  pack: CountrySourcePack,
  requiredDomains: Array<{ domain: ArgusSourceCoverageDomain; minCount: number; label: string }> = DEFAULT_REQUIRED_DOMAINS
): CountryMinimumCoverageResult {
  const missing: string[] = [];

  requiredDomains.forEach(({ domain, minCount, label }) => {
    const count = pack.sources.filter((source) => source.coverageDomain === domain).length;
    if (count < minCount) {
      missing.push(`${label} (${count}/${minCount})`);
    }
  });

  return { satisfied: missing.length === 0, missing };
}
