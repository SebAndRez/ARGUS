import { describe, expect, it } from "vitest";
import { getRegionByCode, listChileRegions, normalizeCommune, normalizeRegionName } from "@/lib/criticalPoi/codigoAzul/chileRegionNormalizer";

describe("normalizeRegionName — las 16 regiones", () => {
  it("resuelve las 16 regiones confirmadas por su nombre canonico", () => {
    for (const region of listChileRegions()) {
      expect(normalizeRegionName(region.canonicalName)).toEqual({ code: region.code, canonicalName: region.canonicalName });
    }
  });

  it("O'Higgins: apostrofe y variante sin apostrofe resuelven al mismo codigo", () => {
    expect(normalizeRegionName("O'Higgins")?.code).toBe(6);
    expect(normalizeRegionName("O Higgins")?.code).toBe(6);
  });

  it("Ñuble: con y sin tilde resuelven al mismo codigo", () => {
    expect(normalizeRegionName("Ñuble")?.code).toBe(16);
    expect(normalizeRegionName("Nuble")?.code).toBe(16);
  });

  it("Valparaíso: con y sin acento resuelven igual", () => {
    expect(normalizeRegionName("Valparaíso")?.code).toBe(5);
    expect(normalizeRegionName("valparaiso")?.code).toBe(5);
  });

  it("region desconocida retorna null, nunca una region inventada", () => {
    expect(normalizeRegionName("Region Inexistente")).toBeNull();
    expect(normalizeRegionName(null)).toBeNull();
    expect(normalizeRegionName(undefined)).toBeNull();
  });

  it("getRegionByCode es el inverso de normalizeRegionName", () => {
    const region = normalizeRegionName("Biobío");
    expect(region).not.toBeNull();
    expect(getRegionByCode(region!.code)?.canonicalName).toBe("Biobío");
  });
});

describe("normalizeCommune", () => {
  it("convierte mayusculas a capitalizacion por palabra", () => {
    expect(normalizeCommune("ALTO HOSPICIO")).toBe("Alto Hospicio");
  });

  it("colapsa espacios repetidos", () => {
    expect(normalizeCommune("Coquimbo   Centro")).toBe("Coquimbo Centro");
  });

  it("ausente/vacio -> undefined, nunca cadena vacia silenciosa", () => {
    expect(normalizeCommune(undefined)).toBeUndefined();
    expect(normalizeCommune("   ")).toBeUndefined();
  });
});
