import es from "@/locales/es.json";
import en from "@/locales/en.json";
import pt from "@/locales/pt.json";
import { defaultLocale, type SupportedLocale } from "@/lib/i18n/locale";

export const dictionaries: Record<SupportedLocale, Record<string, unknown>> = {
  es,
  en,
  pt,
};

export function getDictionary(locale: SupportedLocale) {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

export function translate(
  dictionary: Record<string, unknown>,
  key: string,
  params?: Record<string, string | number>
) {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, dictionary);

  const template = typeof value === "string" ? value : key;
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [paramKey, paramValue]) => text.replaceAll(`{${paramKey}}`, String(paramValue)),
    template
  );
}

