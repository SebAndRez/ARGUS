import { extractCountries } from "@/lib/geo/countryDictionary";
import { extractDisease } from "@/lib/public-health/diseaseDictionary";

export function compactHtml(value?: string) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

export function extractWhoDonDisease(item: Record<string, unknown>) {
  return extractDisease(joinSections(item));
}

export function extractWhoDonCountries(item: Record<string, unknown>) {
  return extractCountries(joinSections(item));
}

export function extractClearCount(text: string, words: string[]) {
  const patterns = words.map((word) => new RegExp(`(\\d[\\d,\\.]*)\\s+(?:confirmed\\s+|suspected\\s+|probable\\s+)?${word}`, "i"));
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { total: Number(match[1].replace(/[,.]/g, "")), confidence: "medium" as const, extractionNotes: "Simple count pattern extracted from WHO DON text." };
  }
  return { confidence: "low" as const, extractionNotes: "No clear count pattern extracted." };
}

export function joinSections(item: Record<string, unknown>) {
  return [
    item.Title,
    item.Summary,
    item.Overview,
    item.Epidemiology,
    item.Assessment,
    item.Advice,
    item.Response,
    item.FurtherInformation,
  ].map((value) => compactHtml(typeof value === "string" ? value : undefined)).filter(Boolean).join(" ");
}
