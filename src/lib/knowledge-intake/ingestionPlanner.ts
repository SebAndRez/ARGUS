import { parseCsvEnvelope } from "@/lib/knowledge-intake/parsers/csvParser";
import { parseDocxEnvelope } from "@/lib/knowledge-intake/parsers/docxParser";
import { parseGeoEnvelope } from "@/lib/knowledge-intake/parsers/geoParser";
import { parseHtmlEnvelope } from "@/lib/knowledge-intake/parsers/htmlParser";
import { parseJsonEnvelope } from "@/lib/knowledge-intake/parsers/jsonParser";
import { parsePdfEnvelope } from "@/lib/knowledge-intake/parsers/pdfParser";
import { parsePlainTextEnvelope } from "@/lib/knowledge-intake/parsers/plainTextParser";
import { parseRssEnvelope } from "@/lib/knowledge-intake/parsers/rssParser";
import { parseXlsxEnvelope } from "@/lib/knowledge-intake/parsers/xlsxParser";
import type {
  ArgusKnowledgeInputEnvelope,
  ArgusKnowledgeInputType,
  ArgusKnowledgeParsedDocument,
} from "@/types/knowledgeIntake";

export type KnowledgeIngestionProcessor =
  | "apiIngestor"
  | "rssIngestor"
  | "csvIngestor"
  | "jsonIngestor"
  | "pdfDocumentProcessor"
  | "htmlExtractor"
  | "documentTextExtractor"
  | "spreadsheetExtractor"
  | "geospatialLayerExtractor"
  | "manualInputProcessor"
  | "citizenReportKnowledgeProcessor"
  | "plannedProcessor";

export function planKnowledgeIngestion(inputType: ArgusKnowledgeInputType): KnowledgeIngestionProcessor {
  if (inputType === "api_rest") return "apiIngestor";
  if (inputType === "rss_atom") return "rssIngestor";
  if (inputType === "csv") return "csvIngestor";
  if (inputType === "json") return "jsonIngestor";
  if (inputType === "pdf") return "pdfDocumentProcessor";
  if (inputType === "html" || inputType === "url") return "htmlExtractor";
  if (inputType === "docx") return "documentTextExtractor";
  if (inputType === "xlsx") return "spreadsheetExtractor";
  if (inputType === "geojson" || inputType === "kml_kmz") return "geospatialLayerExtractor";
  if (inputType === "manual_admin" || inputType === "txt_markdown") return "manualInputProcessor";
  if (inputType === "citizen_report") return "citizenReportKnowledgeProcessor";
  return "plannedProcessor";
}

export function parseKnowledgeEnvelope(envelope: ArgusKnowledgeInputEnvelope): ArgusKnowledgeParsedDocument {
  switch (planKnowledgeIngestion(envelope.inputType)) {
    case "csvIngestor":
      return parseCsvEnvelope(envelope);
    case "jsonIngestor":
    case "apiIngestor":
      return parseJsonEnvelope(envelope);
    case "rssIngestor":
      return parseRssEnvelope(envelope);
    case "pdfDocumentProcessor":
      return parsePdfEnvelope(envelope);
    case "htmlExtractor":
      return parseHtmlEnvelope(envelope);
    case "documentTextExtractor":
      return parseDocxEnvelope(envelope);
    case "spreadsheetExtractor":
      return parseXlsxEnvelope(envelope);
    case "geospatialLayerExtractor":
      return parseGeoEnvelope(envelope);
    default:
      return parsePlainTextEnvelope(envelope);
  }
}
