import { describe, expect, it } from "vitest";
import { getDefaultCategoriesForPurpose, getOsmCategory, isOsmCategoryId, osmCriticalInfrastructureLayer } from "@/lib/osm/osmCategoryRegistry";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/osmCategoryRegistry.test.ts`. This
 * file already used `describe`/`it`/`expect` but never imported them from
 * "vitest" (and lived outside `tests/**`, which is all `vitest.config.ts`
 * includes), so it produced real `tsc --noEmit` errors on every run and was
 * never executed. The only change here is the missing import plus the move.
 */
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
