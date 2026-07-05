export function buildPublicHealthCrossSourceKey(input: { disease?: string; countries?: string[]; regions?: string[]; publishedAt?: string }) {
  const year = input.publishedAt ? new Date(input.publishedAt).getUTCFullYear() : new Date().getUTCFullYear();
  const location = input.countries?.length ? [...input.countries].sort().join("-") : input.regions?.join("-") || "unknown";
  return `${(input.disease ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${location.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${year}`;
}
