import { NextRequest, NextResponse } from "next/server";
import { filterCountrySources, getAllCountrySources } from "@/lib/sources/countrySourceRegistry";
import { resolveCountrySourcePack, validateMinimumCoverage } from "@/lib/sources/countrySourceResolver";
import type { ArgusSourceEntryStatus } from "@/types/sourceRegistry";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? undefined;
  const status = (searchParams.get("status") as ArgusSourceEntryStatus | null) ?? undefined;
  const coverageDomain = searchParams.get("coverageDomain") ?? undefined;

  const sources = filterCountrySources({ country, status, coverageDomain });

  const pack = country ? resolveCountrySourcePack(country) : undefined;
  const coverage = pack ? validateMinimumCoverage(pack) : undefined;

  return NextResponse.json({
    count: sources.length,
    totalRegistered: getAllCountrySources().length,
    sources,
    countryPack: pack
      ? { countryCode: pack.countryCode, countryName: pack.countryName, notes: pack.notes }
      : undefined,
    minimumCoverage: coverage,
  });
}
