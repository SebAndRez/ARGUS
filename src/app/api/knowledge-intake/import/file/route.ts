import { NextResponse } from "next/server";
import { knowledgeImportTemplates } from "@/lib/knowledge-intake/admin/importTemplates";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      status: "planned",
      message: "File ingestion is prepared as a contract stub. Real upload/storage/OCR is not enabled in this sprint.",
      supportedTemplates: knowledgeImportTemplates,
    },
    { status: 202 }
  );
}
