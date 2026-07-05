import { extractCountries } from "@/lib/geo/countryDictionary";
import { extractDisease } from "@/lib/public-health/diseaseDictionary";

export function extractEcdcDiseaseFromText(text: string) {
  return extractDisease(text);
}

export function extractEcdcCountriesFromText(text: string) {
  const countries = extractCountries(text);
  const regions = [
    ...(text.match(/\bEU\/EEA\b/i) ? ["EU/EEA"] : []),
    ...(text.match(/\bEurope\b/i) ? ["Europe"] : []),
    ...(text.match(/\bglobal\b/i) ? ["global"] : []),
  ];
  return { countries, regions };
}

export function extractCdtrPeriod(title: string) {
  const week = title.match(/week\s+(\d{1,2})/i)?.[1];
  const year = title.match(/\b(20\d{2})\b/)?.[1];
  return { cdtrWeek: week, cdtrPeriod: week && year ? `${year}-W${week.padStart(2, "0")}` : undefined };
}
