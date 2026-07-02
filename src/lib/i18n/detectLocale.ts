import { defaultLocale, normalizeLocale, type SupportedLocale } from "@/lib/i18n/locale";

export function detectLocaleFromAcceptLanguage(header?: string | null): SupportedLocale {
  if (!header) return defaultLocale;
  const first = header.split(",")[0]?.trim();
  return normalizeLocale(first);
}

export function detectLocaleFromNavigator(): SupportedLocale {
  if (typeof navigator === "undefined") return defaultLocale;
  return normalizeLocale(navigator.language || navigator.languages?.[0]);
}

