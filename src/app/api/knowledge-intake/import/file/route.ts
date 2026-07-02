import { NextResponse } from "next/server";
import { knowledgeImportTemplates } from "@/lib/knowledge-intake/admin/importTemplates";
import { parseKnowledgeEnvelope } from "@/lib/knowledge-intake/ingestionPlanner";
import type { ArgusKnowledgeInputEnvelope, ArgusKnowledgeInputType } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

const supportedTypes: ArgusKnowledgeInputType[] = ["pdf", "txt_markdown", "csv", "json", "docx", "xlsx"];

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Partial<ArgusKnowledgeInputEnvelope>;
    if (body.rawText && body.inputType && supportedTypes.includes(body.inputType)) {
      const envelope: ArgusKnowledgeInputEnvelope = {
        id: body.id ?? `file-preview-${body.inputType}-${body.rawText.length}`,
        inputType: body.inputType,
        sourceId: body.sourceId,
        sourceName: body.sourceName,
        sourceUrl: body.sourceUrl,
        fileName: body.fileName,
        fileMimeType: body.fileMimeType,
        ingestionMode: body.ingestionMode ?? "adminUpload",
        rawText: body.rawText,
        rawMetadata: body.rawMetadata ?? { submittedThrough: "knowledge-intake-file-preview" },
        language: body.language ?? "es",
        country: body.country,
        receivedAt: body.receivedAt ?? "2026-07-02T00:00:00.000Z",
        processingStatus: "normalized",
        tags: body.tags ?? ["file-preview"],
      };
      return NextResponse.json({
        currentStatus: "preview_parser_available",
        envelope,
        parsedDocument: parseKnowledgeEnvelope(envelope),
        supportedTypes,
        plannedParsers: ["pdf", "txt_markdown", "csv", "json", "docx", "xlsx"],
        nextRequiredStep: "Connect durable upload storage and admin review before accepting real files.",
      });
    }
  }

  return NextResponse.json(
    {
      currentStatus: "contract_ready_storage_pending",
      message: "File ingestion accepts parser previews through JSON rawText. Real upload/storage/OCR is not enabled yet.",
      supportedTypes,
      plannedParsers: ["pdf", "txt_markdown", "csv", "json", "docx", "xlsx"],
      nextRequiredStep: "Define storage, malware scanning, file size limits, admin review and OCR workflow.",
      supportedTemplates: knowledgeImportTemplates,
    },
    { status: 202 }
  );
}
