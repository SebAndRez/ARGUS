export function formatNasaFirmsConfidence(
  value?: string | null,
  normalizedConfidence?: number
) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "l" || normalized === "low") return "baja";
  if (normalized === "n" || normalized === "nominal") return "nominal";
  if (normalized === "h" || normalized === "high") return "alta";

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return `${Math.max(0, Math.min(100, Math.round(numeric)))}%`;
  }
  if (typeof normalizedConfidence === "number") {
    return `${Math.round(normalizedConfidence)}%`;
  }
  return "no especificada";
}
