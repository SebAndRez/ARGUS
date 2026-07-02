"use client";

import { useEffect, useMemo, useState } from "react";
import { detectLocaleFromNavigator } from "@/lib/i18n/detectLocale";
import { getDictionary, translate } from "@/lib/i18n/dictionaries";
import { buildI18nFormatters } from "@/lib/i18n/format";
import { defaultLocale, normalizeLocale, type SupportedLocale } from "@/lib/i18n/locale";
import { getDefaultUnitSystem, type UnitSystem } from "@/lib/units/unitSystem";

export function useI18n(countryCode?: string | null, localeOverride?: string | null) {
  const [locale, setLocale] = useState<SupportedLocale>(() =>
    normalizeLocale(localeOverride ?? defaultLocale)
  );

  useEffect(() => {
    try {
      const storedLocale = window.localStorage.getItem("argus-locale");
      setLocale(normalizeLocale(localeOverride ?? storedLocale ?? detectLocaleFromNavigator()));
    } catch {
      setLocale(normalizeLocale(localeOverride ?? detectLocaleFromNavigator()));
    }
  }, [localeOverride]);

  const units: UnitSystem = useMemo(
    () => getDefaultUnitSystem(locale, countryCode),
    [countryCode, locale]
  );
  const dictionary = useMemo(() => getDictionary(locale), [locale]);
  const formatters = useMemo(() => buildI18nFormatters(locale, units), [locale, units]);

  return {
    locale,
    units,
    setLocale,
    t: (key: string, params?: Record<string, string | number>) =>
      translate(dictionary, key, params),
    ...formatters,
  };
}

