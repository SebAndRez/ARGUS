import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ARGUS Prompt 19 §42 — el panel de operaciones, verificado por lectura de
 * código fuente (mismo patrón que `tests/modules/moduleNavigation.test.ts`
 * y `tests/p0/fenix-canonicalization.test.ts`): este repo corre Vitest en
 * `environment: "node"`, sin `@testing-library/react`, así que no hay
 * renderer DOM disponible para montar el componente.
 */

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../../", relativePath), "utf8");
}

const PAGE_PATH = "src/app/admin/operations/page.tsx";
const PANEL_PATH = "src/app/admin/operations/OperationsPanel.tsx";

describe("ARGUS Operations — guard de servidor (Prompt 19 §29)", () => {
  it("la página es un Server Component (sin 'use client')", () => {
    const source = readSource(PAGE_PATH);
    expect(source).not.toMatch(/^"use client"/m);
  });

  it("resuelve el usuario y valida el rol ANTES de renderizar el panel cliente", () => {
    const source = readSource(PAGE_PATH);
    const authorizedIndex = source.indexOf("authorized");
    const panelRenderIndex = source.indexOf("<OperationsPanel");
    expect(authorizedIndex).toBeGreaterThan(-1);
    expect(panelRenderIndex).toBeGreaterThan(authorizedIndex);
  });

  it("usa el mismo conjunto de roles operador que requireOperator()", () => {
    const source = readSource(PAGE_PATH);
    for (const role of ["OPERATOR", "ANALYST", "ADMIN", "SUPER_ADMIN"]) {
      expect(source).toContain(role);
    }
  });

  it("no depende de localStorage para autorización", () => {
    const source = readSource(PAGE_PATH);
    expect(source).not.toMatch(/localStorage/);
  });
});

describe("ARGUS Operations — panel cliente (Prompt 19 §31-32)", () => {
  it("es un client component", () => {
    const source = readSource(PANEL_PATH);
    expect(source).toMatch(/^"use client"/);
  });

  it("el fetch inicial vive dentro de useEffect, no en el cuerpo del componente", () => {
    const source = readSource(PANEL_PATH);
    const effectIndex = source.indexOf("useEffect(() => {");
    const loadCallIndex = source.indexOf("load();");
    expect(effectIndex).toBeGreaterThan(-1);
    expect(loadCallIndex).toBeGreaterThan(effectIndex);
  });

  it("usa AbortController y lo aborta antes de cada nueva solicitud", () => {
    const source = readSource(PANEL_PATH);
    expect(source).toMatch(/new AbortController\(\)/);
    expect(source).toMatch(/abortRef\.current\?\.abort\(\)/);
  });

  it("limpia el intervalo de polling y el listener de visibilidad al desmontar", () => {
    const source = readSource(PANEL_PATH);
    const cleanupBlock = source.slice(source.lastIndexOf("return () => {"));
    expect(cleanupBlock).toMatch(/stopPolling\(\)/);
    expect(cleanupBlock).toMatch(/removeEventListener\("visibilitychange"/);
    expect(cleanupBlock).toMatch(/abortRef\.current\?\.abort\(\)/);
  });

  it("pausa el polling cuando la pestaña está oculta", () => {
    const source = readSource(PANEL_PATH);
    expect(source).toMatch(/document\.visibilityState === "hidden"/);
  });

  it("el intervalo de polling está entre 30 y 60 segundos", () => {
    const source = readSource(PANEL_PATH);
    const match = source.match(/POLL_INTERVAL_MS\s*=\s*([\d_]+)/);
    expect(match).not.toBeNull();
    const ms = Number(match?.[1]?.replace(/_/g, ""));
    expect(ms).toBeGreaterThanOrEqual(30_000);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  it("no ejecuta adaptadores, jobs ni fuentes directamente — solo llama a /api/operations/health", () => {
    const source = readSource(PANEL_PATH);
    const fetchCalls = [...source.matchAll(/fetch\(["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    expect(fetchCalls).toEqual(["/api/operations/health"]);
  });

  it("distingue estados unauthorized/unavailable explícitos (nunca healthy por defecto durante carga)", () => {
    const source = readSource(PANEL_PATH);
    expect(source).toMatch(/"unauthorized"/);
    expect(source).toMatch(/"unavailable"/);
    expect(source).toMatch(/"loading"/);
  });
});

describe("ARGUS Operations — no reemplaza /admin/source-health", () => {
  it("el panel enlaza a /admin/source-health en vez de duplicar su tabla detallada", () => {
    const source = readSource(PANEL_PATH);
    expect(source).toContain("/admin/source-health");
  });

  it("la página existente /admin/source-health no fue modificada por esta tarea (sigue enteramente cliente)", () => {
    const source = readSource("src/app/admin/source-health/page.tsx");
    expect(source).toMatch(/^"use client"/);
  });
});
