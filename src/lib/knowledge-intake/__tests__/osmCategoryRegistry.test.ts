import { getDefaultCategoriesForPurpose, getOsmCategory, isOsmCategoryId, osmCriticalInfrastructureLayer } from "@/lib/osm/osmCategoryRegistry";

describe("osmCategoryRegistry", () => {
  it("keeps OSM critical infrastructure as a non-incident contextual layer", () => {
    expect(osmCriticalInfrastructureLayer.isIncidentLayer).toBe(false);
    expect(osmCriticalInfrastructureLayer.defaultVisible).toBe(false);
    expect(osmCriticalInfrastructureLayer.attributionRequired).toBe(true);
    expect(osmCriticalInfrastructureLayer.license).toBe("ODbL");
  });

  it("exposes medical, shelter and nav purpose defaults only from whitelist", () => {
    const defaults = [
      ...getDefaultCategoriesForPurpose("aura_medical"),
      ...getDefaultCategoriesForPurpose("fenix_shelter"),
      ...getDefaultCategoriesForPurpose("nav_route_context"),
    ];
    expect(defaults.every(isOsmCategoryId)).toBe(true);
    expect(getOsmCategory("medical_hospital")?.tags).toEqual(expect.arrayContaining([{ key: "amenity", value: "hospital" }]));
    expect(getOsmCategory("buildings")?.heavy).toBe(true);
  });
});
