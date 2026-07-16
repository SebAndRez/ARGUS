import { NextResponse } from "next/server";

/**
 * ARGUS — guarda de tamaño de payload (Prompt 12 §18). Complementa, no
 * reemplaza, el rate limiting: un solo request enorme puede ser costoso aun
 * dentro de la cuota permitida. Se basa en el header `Content-Length`
 * (rápido, no requiere leer el body) — un cliente que mienta sobre su propio
 * `Content-Length` puede evadir este chequeo puntual, así que esto es una
 * primera línea de defensa razonable, no un sistema completo de upload con
 * enforcement por streaming (explícitamente fuera de alcance, §18).
 */
export function rejectOversizedPayload(
  request: { headers: { get(name: string): string | null } },
  maxBytes: number
): NextResponse | null {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const size = Number(raw);
  if (!Number.isFinite(size) || size <= maxBytes) return null;

  return NextResponse.json(
    {
      error: "PAYLOAD_TOO_LARGE",
      message: `Request body exceeds the ${maxBytes} byte limit for this endpoint.`,
    },
    { status: 413 }
  );
}
