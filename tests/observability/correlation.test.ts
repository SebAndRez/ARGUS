import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER, resolveRequestId, withRequestIdHeader } from "../../src/lib/observability/requestId";
import { resolveIdempotencyKey } from "../../src/lib/jobs/runIdentity";

/**
 * ARGUS Prompt 19 §39 — continuidad de identificadores. No exige tracing
 * distribuido de proveedor externo; exige que el mismo identificador viaje
 * de punta a punta dentro de ARGUS.
 */

describe("Request → requestId → response header → log", () => {
  it("un header X-Request-Id válido y confiable se reutiliza tal cual", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: "client-provided-id-123" });
    const requestId = resolveRequestId(headers);
    expect(requestId).toBe("client-provided-id-123");
  });

  it("sin header, se genera un UUID nuevo", () => {
    const requestId = resolveRequestId(new Headers());
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("un header con formato inválido se descarta y se genera uno nuevo (nunca se confía ciegamente)", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: "<script>alert(1)</script>" });
    const requestId = resolveRequestId(headers);
    expect(requestId).not.toBe("<script>alert(1)</script>");
  });

  it("el mismo requestId resuelto se adjunta como header de respuesta", () => {
    const requestId = resolveRequestId(new Headers());
    const response = withRequestIdHeader(NextResponse.json({ ok: true }), requestId);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
  });
});

describe("Job: runId de workflow → endpoint → motor → fuente → persistencia → resultado", () => {
  it("un Idempotency-Key válido se preserva como runId de la corrida completa", () => {
    const headers = new Headers({ "Idempotency-Key": "argus-run-global-watch-12345-1" });
    const resolved = resolveIdempotencyKey(headers);
    expect(resolved.provided).toBe(true);
    expect(resolved.valid).toBe(true);
    expect(resolved.runId).toBe("argus-run-global-watch-12345-1");
  });

  it("X-Argus-Run-Id es un alias válido del mismo mecanismo", () => {
    const headers = new Headers({ "X-Argus-Run-Id": "argus-run-chile-alerts-99-1" });
    const resolved = resolveIdempotencyKey(headers);
    expect(resolved.runId).toBe("argus-run-chile-alerts-99-1");
  });

  it("sin ningún header, se genera un runId nuevo y válido", () => {
    const resolved = resolveIdempotencyKey(new Headers());
    expect(resolved.provided).toBe(false);
    expect(typeof resolved.runId).toBe("string");
    expect(resolved.runId.length).toBeGreaterThan(0);
  });
});
