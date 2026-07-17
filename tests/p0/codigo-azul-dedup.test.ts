import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Extension de dedup para Codigo Azul: reordenamiento de autoridad
 * (codigo_azul entre senapred y municipality) + resolucion de identidad
 * combinada (`resolveShelterCandidateIdentity`) para el caso ambiguo
 * (mas de una coincidencia difusa -> requiere revision, nunca se fusiona
 * automaticamente). `@/lib/prisma` se mockea porque el modulo importa
 * `criticalPoiPersistenceService.ts`, que lo usa a nivel de consulta.
 */

const findManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { criticalPoi: { findMany: findManyMock } },
}));

import { resolveShelterCandidateIdentity } from "@/lib/criticalPoi/shelterStatusDeduplication";
import { shelterSourceAuthorityRank } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

function poiRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "poi-1",
    externalId: "484697",
    source: "official_open_data",
    name: "Albergue ONG Maria Olga Ester",
    category: "shelter",
    priority: "P3",
    latitude: -18.46843,
    longitude: -70.30483,
    countryCode: "CL",
    adminLevel1: null,
    adminLevel2: null,
    city: "Arica",
    address: null,
    status: "active",
    confidence: 80,
    lastSeenAt: new Date(),
    lastVerifiedAt: null,
    tagsJson: null,
    sourceUrl: null,
    isPersistent: true,
    isVisibleByDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("shelterSourceAuthorityRank — Codigo Azul entre SENAPRED y municipalidad", () => {
  it("codigo_azul tiene mayor autoridad que municipality/manual_operator/media/osm", () => {
    expect(shelterSourceAuthorityRank.codigo_azul).toBeLessThan(shelterSourceAuthorityRank.municipality);
    expect(shelterSourceAuthorityRank.codigo_azul).toBeLessThan(shelterSourceAuthorityRank.manual_operator);
    expect(shelterSourceAuthorityRank.codigo_azul).toBeLessThan(shelterSourceAuthorityRank.media);
    expect(shelterSourceAuthorityRank.codigo_azul).toBeLessThan(shelterSourceAuthorityRank.osm);
  });

  it("senapred sigue siendo la maxima autoridad, por encima de codigo_azul", () => {
    expect(shelterSourceAuthorityRank.senapred).toBeLessThan(shelterSourceAuthorityRank.codigo_azul);
  });
});

describe("resolveShelterCandidateIdentity", () => {
  afterEach(() => {
    findManyMock.mockReset();
  });

  it("match exacto por [source, externalId] -> kind 'exact'", async () => {
    findManyMock.mockResolvedValue([poiRow()]);
    const result = await resolveShelterCandidateIdentity({
      name: "Albergue ONG Maria Olga Ester",
      commune: "Arica",
      lat: -18.46843,
      lng: -70.30483,
      externalId: "484697",
      source: "official_open_data",
    });
    expect(result.kind).toBe("exact");
  });

  it("sin match exacto pero un unico match difuso por nombre -> kind 'single_fuzzy'", async () => {
    findManyMock.mockResolvedValue([poiRow({ externalId: "999999" })]);
    const result = await resolveShelterCandidateIdentity({
      name: "Albergue ONG Maria Olga Ester",
      commune: "Arica",
      lat: -18.46843,
      lng: -70.30483,
      externalId: "484697",
      source: "official_open_data",
    });
    expect(result.kind).toBe("single_fuzzy");
  });

  it("dos o mas coincidencias difusas -> kind 'ambiguous', nunca fusiona automaticamente", async () => {
    findManyMock.mockResolvedValue([
      poiRow({ id: "poi-1", externalId: "111111", name: "Albergue Fundación Caritas" }),
      poiRow({ id: "poi-2", externalId: "222222", name: "Albergue Fundación Caritas Anexo" }),
    ]);
    const result = await resolveShelterCandidateIdentity({
      name: "Albergue Fundación Caritas",
      commune: "Arica",
      lat: -18.46843,
      lng: -70.30483,
      externalId: "484697",
      source: "official_open_data",
    });
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.candidates).toHaveLength(2);
  });

  it("sin coincidencias -> kind 'new'", async () => {
    findManyMock.mockResolvedValue([]);
    const result = await resolveShelterCandidateIdentity({
      name: "Refugio Completamente Nuevo",
      commune: "Coquimbo",
      lat: -29.95,
      lng: -71.34,
      externalId: "999888",
      source: "official_open_data",
    });
    expect(result.kind).toBe("new");
  });

  it("sin coordenadas -> kind 'new' (nunca inventa una busqueda por proximidad sin coordenadas)", async () => {
    const result = await resolveShelterCandidateIdentity({ name: "Sin coordenadas", source: "official_open_data" });
    expect(result.kind).toBe("new");
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
