import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parseGeoEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  const text = envelope.rawText ?? JSON.stringify(envelope.rawMetadata ?? {});
  const hasCoordinates = /coordinates|Point|Polygon|LineString|<coordinates>/i.test(text);
  return parsedDocumentFromEnvelope(envelope, {
    text,
    extractionConfidence: hasCoordinates ? 72 : 35,
    metadata: { parser: "geoParser", hasCoordinates },
  });
}
