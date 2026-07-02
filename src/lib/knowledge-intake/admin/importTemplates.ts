import type { ArgusKnowledgeImportTemplate } from "@/types/knowledgeIntake";

export const knowledgeImportTemplates: ArgusKnowledgeImportTemplate[] = [
  {
    id: "manual-incident-text",
    name: "Manual incident text",
    inputType: "manual_admin",
    requiredFields: ["rawText", "sourceName", "domain"],
    optionalFields: ["country", "region", "sourceUrl", "tags"],
    example: {
      sourceName: "Informe tecnico",
      country: "CL",
      rawText: "Resumen del incidente, ubicacion, fecha, impacto y respuesta.",
    },
  },
  {
    id: "document-upload-planned",
    name: "Document upload planned",
    inputType: "pdf",
    requiredFields: ["fileName", "fileMimeType"],
    optionalFields: ["sourceId", "country", "language", "tags"],
    example: {
      fileName: "incident-report.pdf",
      fileMimeType: "application/pdf",
      tags: ["technical-report"],
    },
  },
  {
    id: "dataset-csv-planned",
    name: "CSV dataset planned",
    inputType: "csv",
    requiredFields: ["sourceId", "rawText"],
    optionalFields: ["licenseNotes", "coverage", "tags"],
    example: {
      sourceId: "conaset_chile",
      rawText: "id,date,location,type",
    },
  },
];
