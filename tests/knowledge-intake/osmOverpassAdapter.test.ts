import { describe, expect, it } from "vitest";
import {
  buildOsmCriticalInfrastructureContext,
  buildOsmEvidence,
  buildOverpassQuery,
  classifyOsmPoi,
  dedupeOsmElements,
  normalizeOsmElement,
  validateOsmOverpassRequest,
} from "@/lib/knowledge-intake/adapters/osmOverpassAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/osmOverpassAdapter.test.ts`. This file
 * already used `describe`/`it`/`expect` but never imported them from
 * "vitest" (and lived outside `tests/**`, which is all `vitest.config.ts`
 * includes), so it produced real `tsc --noEmit` errors on every run and was
 * never executed. The only change here is the missing import plus the move.
 */
describe("osmOverpassAdapter", () => {
  it("rejects missing area and non-whitelisted categories", () => {
    expect(validateOsmOverpassRequest({ purpose: "general" }).valid).toBe(false);
    const invalid = validateOsmOverpassRequest({ lat: 0, lon: 0, categories: ["raw_query"] });
    expect(invalid.valid).toBe(false);
    expect(invalid.valid ? "" : invalid.message).toContain("Unsupported OSM categories");
  });

  it("enforces purpose/category radius limits and builds bounded Overpass QL", () => {
    expect(validateOsmOverpassRequest({ lat: 0, lon: 0, radiusKm: 50, purpose: "aura_medical" }).valid).toBe(false);
    const query = buildOverpassQuery({ lat: -33.4489, lon: -70.6693, radiusKm: 3, categories: ["medical_hospital"], timeoutSeconds: 15, limit: 25 });
    expect(query).toContain("[out:json][timeout:15]");
    expect(query).toContain('node["amenity"="hospital"](around:3000,-33.448900,-70.669300);');
    expect(query).not.toContain("{{");
  });

  it("classifies and normalizes OSM node, way center and relation center", () => {
    expect(classifyOsmPoi({ amenity: "hospital" })).toContain("medical_hospital");
    const params = { lat: -33.44, lon: -70.66, radiusKm: 5, categories: ["medical_hospital", "bridge"], limit: 10 };
    const node = normalizeOsmElement({ type: "node", id: 1, lat: -33.45, lon: -70.67, tags: { amenity: "hospital", name: "Hospital X", "addr:city": "Santiago" } }, params);
    const way = normalizeOsmElement({ type: "way", id: 2, center: { lat: -33.46, lon: -70.68 }, tags: { bridge: "yes", highway: "primary" } }, params);
    const relation = normalizeOsmElement({ type: "relation", id: 3, center: { lat: -33.47, lon: -70.69 }, tags: { amenity: "hospital" } }, params);
    expect(node?.osmType).toBe("node");
    expect(node?.address?.city).toBe("Santiago");
    expect(way?.category).toBe("bridge");
    expect(relation?.osmType).toBe("relation");
  });

  it("dedupes by OSM id, creates CriticalInfrastructureContext and evidence without incidents", () => {
    const params = { lat: -33.44, lon: -70.66, radiusKm: 5, categories: ["medical_hospital", "emergency_fire_station", "shelter"], limit: 10 };
    const context = buildOsmCriticalInfrastructureContext(params, [
      { type: "node", id: 1, lat: -33.45, lon: -70.67, tags: { amenity: "hospital", name: "Hospital X" } },
      { type: "node", id: 1, lat: -33.45, lon: -70.67, tags: { amenity: "hospital", name: "Hospital X" } },
      { type: "way", id: 2, center: { lat: -33.46, lon: -70.68 }, tags: { amenity: "fire_station" } },
      { type: "relation", id: 3, center: { lat: -33.47, lon: -70.69 }, tags: { amenity: "shelter" } },
    ]);
    expect(context.sourceId).toBe("osm-overpass");
    expect(context.pois).toHaveLength(3);
    expect(context.medical.nearestHospital?.osmId).toBe(1);
    expect(context.emergency.nearestFireStation?.osmId).toBe(2);
    expect(context.evidenceRefs).toContain("osm-overpass:node:1");
    const evidence = buildOsmEvidence(context, params);
    expect(evidence.sourceId).toBe("osm-overpass");
    expect(evidence.incidentId).toBeUndefined();
    expect(dedupeOsmElements(context.pois)).toHaveLength(3);
  });

  it("accepts controlled bbox queries", () => {
    const validation = validateOsmOverpassRequest({ bbox: "-70.7,-33.5,-70.6,-33.4", categories: ["fuel"], limit: 50 });
    expect(validation.valid).toBe(true);
    const query = buildOverpassQuery({ bbox: "-70.7,-33.5,-70.6,-33.4", categories: ["fuel"], limit: 50 });
    expect(query).toContain('node["amenity"="fuel"](-33.500000,-70.700000,-33.400000,-70.600000);');
  });
});
