import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";

export function runIncidentNormalizerTest() {
  const incident = normalizeKnowledgeInput({
    id: "test-normalizer",
    inputType: "manual_admin",
    sourceId: "csb",
    sourceName: "CSB test",
    ingestionMode: "manual",
    rawText: "Explosion industrial con chlorine, heridos y ruta afectada en Chile 2024-01-01.",
    language: "es",
    country: "CL",
    receivedAt: "2026-07-02T00:00:00.000Z",
    processingStatus: "normalized",
    tags: ["test"],
  });

  return {
    passed: incident.domain === "chemical_accident" || incident.domain === "explosion",
    incident,
  };
}
