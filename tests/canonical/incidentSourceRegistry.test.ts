import { describe, expect, it } from "vitest";
import { resolveArgusSourceType, resolveIncidentSource } from "@/lib/canonical/incidentSourceRegistry";

describe("resolveArgusSourceType", () => {
  it("news_evidence siempre resuelve a 'news'", () => {
    expect(resolveArgusSourceType("news_evidence")).toBe("news");
  });

  it("fuente oficial conocida resuelve a 'official'", () => {
    expect(resolveArgusSourceType("usgs_earthquake")).toBe("official");
    expect(resolveArgusSourceType("senapred_eventos")).toBe("official");
  });

  it("fuente de solo contexto resuelve a 'model_context'", () => {
    expect(resolveArgusSourceType("open-meteo")).toBe("model_context");
  });

  it("fuente desconocida resuelve a 'global_feed', nunca 'official'", () => {
    expect(resolveArgusSourceType("does-not-exist")).toBe("global_feed");
  });
});

describe("resolveIncidentSource", () => {
  it("consolida id/nombre/tipo/oficialidad/confiabilidad para una fuente registrada", () => {
    const source = resolveIncidentSource("usgs_earthquake");
    expect(source).toEqual({
      id: "usgs_earthquake",
      name: "USGS Earthquake Hazards",
      type: "official",
      isOfficial: true,
      reliabilityScore: 94,
    });
  });

  it("fuente no registrada nunca se marca oficial ni con confiabilidad > 0", () => {
    const source = resolveIncidentSource("mystery-source", "Mystery Feed");
    expect(source.isOfficial).toBe(false);
    expect(source.reliabilityScore).toBe(0);
    expect(source.name).toBe("Mystery Feed");
  });

  it("news_evidence tiene un perfil fijo no oficial", () => {
    const source = resolveIncidentSource("news_evidence");
    expect(source.isOfficial).toBe(false);
    expect(source.type).toBe("news");
  });
});
