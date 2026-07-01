import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const deviceIdHash = String(body.deviceIdHash ?? "").trim();
  const capabilities = Array.isArray(body.capabilities)
    ? body.capabilities.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
    : [];

  if (!deviceIdHash) {
    return NextResponse.json({ updated: false, error: "deviceIdHash requerido." }, { status: 400 });
  }

  return NextResponse.json({
    updated: true,
    mode: "runtime_placeholder",
    deviceIdHash,
    capabilities,
    message: "Capacidades recibidas. No se guardan push tokens ni secretos en esta fase.",
  });
}
