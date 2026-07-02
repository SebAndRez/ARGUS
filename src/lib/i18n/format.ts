import {
  formatArea,
  formatDistance,
  formatRainfall,
  formatSpeed,
  formatTemperature,
  formatWindSpeed,
  type UnitSystem,
} from "@/lib/units/unitSystem";
import type { SupportedLocale } from "@/lib/i18n/locale";

export function buildI18nFormatters(locale: SupportedLocale, units: UnitSystem) {
  return {
    formatNumber(value: number) {
      return new Intl.NumberFormat(locale).format(value);
    },
    formatDateTime(value: string | number | Date) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    },
    formatDistance: (meters: number) => formatDistance(meters, units),
    formatSpeed: (kmh: number) => formatSpeed(kmh, units),
    formatArea: (squareMeters: number) => formatArea(squareMeters, units),
    formatTemperature: (celsius: number) => formatTemperature(celsius, units),
    formatWindSpeed: (kmh: number) => formatWindSpeed(kmh, units),
    formatRainfall: (mm: number) => formatRainfall(mm, units),
  };
}

