export type UnitSystem = "METRIC" | "US_CUSTOMARY" | "IMPERIAL";

const usCustomaryCountries = new Set(["US", "USA", "PR", "GU", "AS", "VI", "UM"]);
const imperialCountries = new Set(["LR", "MM"]);

export function detectUnitSystem(countryCode?: string | null, locale?: string | null): UnitSystem {
  const country = countryCode?.trim().toUpperCase();
  if (country && usCustomaryCountries.has(country)) return "US_CUSTOMARY";
  if (country && imperialCountries.has(country)) return "IMPERIAL";
  if (!country && locale?.toLowerCase().includes("-us")) return "US_CUSTOMARY";
  return "METRIC";
}

export function getDefaultUnitSystem(locale?: string | null, countryCode?: string | null): UnitSystem {
  return detectUnitSystem(countryCode, locale);
}

function number(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits }).format(value);
}

export function formatDistance(meters: number, unitSystem: UnitSystem) {
  if (unitSystem === "US_CUSTOMARY" || unitSystem === "IMPERIAL") {
    if (meters < 1609.344) return `${number(meters * 3.28084, 0)} ft`;
    return `${number(meters / 1609.344)} mi`;
  }
  if (meters < 1000) return `${number(meters, 0)} m`;
  return `${number(meters / 1000)} km`;
}

export function formatSpeed(kmh: number, unitSystem: UnitSystem) {
  if (unitSystem === "US_CUSTOMARY" || unitSystem === "IMPERIAL") return `${number(kmh * 0.621371)} mph`;
  return `${number(kmh)} km/h`;
}

export function formatArea(squareMeters: number, unitSystem: UnitSystem) {
  if (unitSystem === "US_CUSTOMARY" || unitSystem === "IMPERIAL") {
    if (squareMeters < 2_589_988) return `${number(squareMeters / 4046.856)} acres`;
    return `${number(squareMeters / 2_589_988)} mi²`;
  }
  if (squareMeters < 1_000_000) return `${number(squareMeters / 10_000)} ha`;
  return `${number(squareMeters / 1_000_000)} km²`;
}

export function formatTemperature(celsius: number, unitSystem: UnitSystem) {
  if (unitSystem === "US_CUSTOMARY" || unitSystem === "IMPERIAL") return `${number(celsius * 9 / 5 + 32)} °F`;
  return `${number(celsius)} °C`;
}

export function formatWindSpeed(kmh: number, unitSystem: UnitSystem) {
  return formatSpeed(kmh, unitSystem);
}

export function formatRainfall(mm: number, unitSystem: UnitSystem) {
  if (unitSystem === "US_CUSTOMARY" || unitSystem === "IMPERIAL") return `${number(mm / 25.4, 2)} in`;
  return `${number(mm)} mm`;
}

