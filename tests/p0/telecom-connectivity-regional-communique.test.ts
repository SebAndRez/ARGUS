import { describe, expect, it } from "vitest";
import { buildRegionKey } from "@/lib/connectivity/telecomConnectivityService";

/**
 * Comunicado que solo informa la region, sin comuna precisa (spec ARGUS
 * v1.0.3.6 §5/§16): `buildRegionKey` nunca inventa una comuna — un
 * `adminLevel2` ausente/null se representa como cadena vacia en la clave,
 * distinta de cualquier comuna real nombrada explicitamente.
 */

describe("buildRegionKey — comunicado solo-region", () => {
  it("adminLevel2 null produce una clave estable distinta de una comuna nombrada", () => {
    const regionOnly = buildRegionKey({ countryCode: "CL", adminLevel1: "Valparaíso", adminLevel2: null, carrierScope: "all_carriers" });
    const withCommune = buildRegionKey({ countryCode: "CL", adminLevel1: "Valparaíso", adminLevel2: "Viña del Mar", carrierScope: "all_carriers" });
    expect(regionOnly).not.toBe(withCommune);
    expect(regionOnly).toBe("CL:Valparaíso::all_carriers");
  });

  it("adminLevel2 ausente (undefined) se comporta igual que null", () => {
    const withUndefined = buildRegionKey({ countryCode: "CL", adminLevel1: "Biobío", carrierScope: "all_carriers" });
    const withNull = buildRegionKey({ countryCode: "CL", adminLevel1: "Biobío", adminLevel2: null, carrierScope: "all_carriers" });
    expect(withUndefined).toBe(withNull);
  });

  it("distintos alcances de operadora producen claves distintas para la misma region", () => {
    const allCarriers = buildRegionKey({ countryCode: "CL", adminLevel1: "Maule", adminLevel2: null, carrierScope: "all_carriers" });
    const entelOnly = buildRegionKey({ countryCode: "CL", adminLevel1: "Maule", adminLevel2: null, carrierScope: "entel" });
    expect(allCarriers).not.toBe(entelOnly);
  });
});
