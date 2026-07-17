import { afterEach, describe, expect, it } from "vitest";
import { checkOperationalAvailability, resolveOperationsDefinition } from "@/lib/source-governance/sourceOperationalBridge";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveOperationsDefinition", () => {
  it("resuelve un id hyphen de gobernanza a su contraparte underscore operacional", () => {
    expect(resolveOperationsDefinition("usgs-earthquake")?.id).toBe("usgs_earthquake");
  });

  it("resuelve el propio id underscore igualmente (idempotente)", () => {
    expect(resolveOperationsDefinition("usgs_earthquake")?.id).toBe("usgs_earthquake");
  });

  it("retorna undefined para un sub-producto de gobernanza sin contraparte operacional", () => {
    expect(resolveOperationsDefinition("usgs-shakemap")).toBeUndefined();
  });
});

describe("checkOperationalAvailability", () => {
  it("una fuente programada e implementada está disponible", () => {
    const verdict = checkOperationalAvailability("gdacs");
    expect(verdict.available).toBe(true);
  });

  it("un adaptador stub (copernicus-glofas) nunca está disponible", () => {
    const verdict = checkOperationalAvailability("copernicus-glofas");
    expect(verdict.available).toBe(false);
    expect(verdict.reason).toMatch(/stub/i);
  });

  it("una fuente que requiere credencial ausente queda no disponible", () => {
    delete process.env.OPENAQ_API_KEY;
    const verdict = checkOperationalAvailability("openaq");
    expect(verdict.available).toBe(false);
    expect(verdict.reason).toContain("OPENAQ_API_KEY");
  });

  it("una fuente sin contraparte operacional se asume disponible (fail-open a nivel de capacidad)", () => {
    const verdict = checkOperationalAvailability("usgs-shakemap");
    expect(verdict.available).toBe(true);
  });
});
