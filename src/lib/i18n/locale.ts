export const supportedLocales = ["es", "en", "pt"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "es";

export function normalizeLocale(value?: string | null): SupportedLocale {
  if (!value) return defaultLocale;
  const lower = value.toLowerCase();
  const language = lower.split("-")[0];
  if (language === "en" || language === "pt" || language === "es") return language;
  return defaultLocale;
}

