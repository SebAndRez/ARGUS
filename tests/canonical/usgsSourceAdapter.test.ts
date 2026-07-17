import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/knowledge-intake/adapters/usgsAdapter", async () => {
  const actual = await vi.importActual<typeof import("@/lib/knowledge-intake/adapters/usgsAdapter")>(
    "@/lib/knowledge-intake/adapters/usgsAdapter"
  );
  return { ...actual, fetchRawUsgsFeed: vi.fn() };
});

import { fetchRawUsgsFeed } from "@/lib/knowledge-intake/adapters/usgsAdapter";
import { usgsSourceAdapter, USGS_EARTHQUAKE_SOURCE_ID } from "@/lib/canonical/adapters/usgsSourceAdapter";

const fetchRawUsgsFeedMock = vi.mocked(fetchRawUsgsFeed);

const SAMPLE_FEATURE = {
  id: "us7000abcd",
  properties: {
    mag: 6.4,
    place: "120km W of Valparaiso, Chile",
    time: 1752739200000,
    updated: 1752739260000,
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
    title: "M 6.4 - 120km W of Valparaiso, Chile",
    tsunami: 0,
  },
  geometry: { type: "Point", coordinates: [-71.9, -33.05, 35] as [number, number, number] },
};

beforeEach(() => {
  fetchRawUsgsFeedMock.mockReset();
});

describe("usgsSourceAdapter — contrato fetch/normalize/validate (Prompt 4 Fase D)", () => {
  it("expone el sourceId canónico de USGS sismos", () => {
    expect(usgsSourceAdapter.sourceId).toBe("usgs_earthquake");
    expect(USGS_EARTHQUAKE_SOURCE_ID).toBe("usgs_earthquake");
  });

  it("fetch() envuelve fetchRawUsgsFeed y retorna ok:true con el payload crudo", async () => {
    fetchRawUsgsFeedMock.mockResolvedValue({ type: "FeatureCollection", features: [SAMPLE_FEATURE] });

    const result = await usgsSourceAdapter.fetch({ timeoutMs: 10_000 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.features).toHaveLength(1);
      expect(typeof result.fetchedAt).toBe("string");
    }
  });

  it("fetch() clasifica un error de red con classifySourceError, nunca lanza", async () => {
    fetchRawUsgsFeedMock.mockRejectedValue(new Error("USGS responded 503"));

    const result = await usgsSourceAdapter.fetch({ timeoutMs: 10_000 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("UPSTREAM_5XX");
      expect(result.errorMessage).toContain("503");
    }
  });

  it("normalize() reutiliza normalizeUsgsEarthquakeFeature sin duplicar la lógica de severidad", () => {
    const observations = usgsSourceAdapter.normalize(
      { type: "FeatureCollection", features: [SAMPLE_FEATURE] },
      { sourceId: "usgs_earthquake", fetchedAt: new Date().toISOString() }
    );

    expect(observations).toHaveLength(1);
    expect(observations[0].id).toBe("usgs-us7000abcd");
    expect(observations[0].severity).toBe("high");
    expect(observations[0].sourceIds).toEqual(["usgs_earthquake"]);
  });

  it("normalize() descarta features sin coordenadas válidas", () => {
    const observations = usgsSourceAdapter.normalize(
      { type: "FeatureCollection", features: [{ ...SAMPLE_FEATURE, geometry: undefined }] },
      { sourceId: "usgs_earthquake", fetchedAt: new Date().toISOString() }
    );
    expect(observations).toHaveLength(0);
  });

  it("validate() acepta una observación normalizada real", () => {
    const [observation] = usgsSourceAdapter.normalize(
      { type: "FeatureCollection", features: [SAMPLE_FEATURE] },
      { sourceId: "usgs_earthquake", fetchedAt: new Date().toISOString() }
    );
    expect(usgsSourceAdapter.validate(observation).valid).toBe(true);
  });
});
