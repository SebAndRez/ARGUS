import type { NextResponse } from "next/server";

/**
 * ARGUS Prompt 19 §8 — identidad de correlación por solicitud HTTP.
 * Distinta y complementaria a `src/lib/jobs/runIdentity.ts` (que sigue
 * siendo la identidad de *corrida de job*, sin cambios): esta es para
 * cualquier request, no solo pipelines programados. Mismo patrón de
 * validación (aceptar header confiable con formato válido, si no generar
 * uno nuevo) — nunca se usa como autenticación.
 */

export const REQUEST_ID_HEADER = "X-Request-Id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;

export function resolveRequestId(headers: Headers): string {
  const provided = headers.get(REQUEST_ID_HEADER);
  if (provided && REQUEST_ID_PATTERN.test(provided)) return provided;
  return crypto.randomUUID();
}

export function withRequestIdHeader(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
