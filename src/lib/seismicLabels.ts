type SeismicClassification = "Temblor" | "Sismo fuerte" | "Terremoto";

const MERCALLI_LEVELS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
] as const;

function toRomanMercalli(value: number) {
  const rounded = Math.max(1, Math.min(12, Math.round(value)));
  return MERCALLI_LEVELS[rounded - 1];
}

export function classifySeismicEvent(
  magnitude: number,
  officialMmi?: number | null
): SeismicClassification {
  if (typeof officialMmi === "number" && officialMmi >= 7) {
    return "Terremoto";
  }
  if (magnitude >= 6.5) return "Terremoto";
  if (magnitude >= 5.5) return "Sismo fuerte";
  return "Temblor";
}

export function formatMagnitudeLabel(
  magnitude: number,
  magnitudeType?: string | null
) {
  const rawType = magnitudeType?.trim();
  const normalizedType = rawType?.toLowerCase().startsWith("mw")
    ? "Mw"
    : rawType;
  return normalizedType
    ? `Magnitud ${magnitude.toFixed(1)} ${normalizedType}`
    : `Magnitud ${magnitude.toFixed(1)} (referencia Richter/Mw)`;
}

export function formatMagnitudePhrase(
  magnitude: number,
  magnitudeType?: string | null
) {
  return formatMagnitudeLabel(magnitude, magnitudeType).replace(
    /^Magnitud/,
    "magnitud"
  );
}

export function estimateMercalliFromMagnitude(
  magnitude: number,
  depthKm?: number | null
) {
  let range: [number, number];

  if (magnitude < 2.5) range = [1, 2];
  else if (magnitude < 4) range = [2, 3];
  else if (magnitude < 5) range = [4, 5];
  else if (magnitude < 6) range = [5, 6];
  else if (magnitude < 7) range = [7, 8];
  else if (magnitude < 8) range = [9, 10];
  else range = [11, 12];

  if (typeof depthKm === "number" && depthKm >= 150) {
    range = [Math.max(1, range[0] - 1), Math.max(1, range[1] - 1)];
  }

  return range[0] === range[1]
    ? toRomanMercalli(range[0])
    : `${toRomanMercalli(range[0])}-${toRomanMercalli(range[1])}`;
}

export function formatMercalliLabel(
  officialMmi?: number | null,
  estimatedMmi?: string | null
) {
  if (typeof officialMmi === "number" && Number.isFinite(officialMmi)) {
    return `Mercalli ${toRomanMercalli(officialMmi)}, informada por la fuente`;
  }
  if (estimatedMmi) {
    return `Mercalli estimada ARGUS: ${estimatedMmi}`;
  }
  return "Mercalli no informada por la fuente";
}
