import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { computeRecommendedModules, recordModuleActivationRecommendation } from "@/lib/modules/moduleActivationEngine";

const auditLogFindFirst = vi.mocked(prisma.auditLog.findFirst);
const auditLogCreate = vi.mocked(prisma.auditLog.create);

describe("computeRecommendedModules", () => {
  it("recommends evacuation/shelter modules for a high-severity wildfire", () => {
    const modules = computeRecommendedModules({
      domain: "wildfire",
      subtype: null,
      effectiveSeverity: "high",
      severity: "high",
    });
    expect(modules).toEqual(expect.arrayContaining(["fenix", "hermes", "arca"]));
  });

  it("returns no recommendation when severity is below the rule threshold", () => {
    const modules = computeRecommendedModules({
      domain: "wildfire",
      subtype: null,
      effectiveSeverity: "low",
      severity: "low",
    });
    expect(modules).toEqual([]);
  });

  it("always adds ATLAS/VESTA for a multi-hazard parent incident regardless of its own threat classification", () => {
    const modules = computeRecommendedModules({
      domain: "multi_hazard_event",
      subtype: "severe_weather_system",
      effectiveSeverity: "high",
      severity: "high",
    });
    expect(modules).toEqual(expect.arrayContaining(["atlas", "vesta"]));
  });

  it("recommends CUSTOS/ORACULO only for civil unrest, never for unrelated domains", () => {
    const civilUnrest = computeRecommendedModules({
      domain: "civil_unrest",
      subtype: null,
      effectiveSeverity: "medium",
      severity: "medium",
    });
    expect(civilUnrest).toEqual(expect.arrayContaining(["custos", "oraculo"]));

    const earthquakeLow = computeRecommendedModules({
      domain: "earthquake",
      subtype: null,
      effectiveSeverity: "low",
      severity: "low",
    });
    expect(earthquakeLow).not.toContain("custos");
  });
});

describe("recordModuleActivationRecommendation", () => {
  beforeEach(() => {
    auditLogFindFirst.mockReset();
    auditLogCreate.mockReset();
    auditLogCreate.mockResolvedValue({} as never);
  });

  it("logs a new recommendation when none existed before", async () => {
    auditLogFindFirst.mockResolvedValue(null as never);
    const logged = await recordModuleActivationRecommendation("incident-1", ["fenix", "hermes"]);
    expect(logged).toBe(true);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
  });

  it("does not log again when the recommended module set is unchanged", async () => {
    auditLogFindFirst.mockResolvedValue({ metadata: JSON.stringify({ modules: ["fenix", "hermes"] }) } as never);
    const logged = await recordModuleActivationRecommendation("incident-1", ["hermes", "fenix"]);
    expect(logged).toBe(false);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("logs again when the recommended module set changed", async () => {
    auditLogFindFirst.mockResolvedValue({ metadata: JSON.stringify({ modules: ["fenix"] }) } as never);
    const logged = await recordModuleActivationRecommendation("incident-1", ["fenix", "arca"]);
    expect(logged).toBe(true);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
  });

  it("never logs an empty recommendation", async () => {
    const logged = await recordModuleActivationRecommendation("incident-1", []);
    expect(logged).toBe(false);
    expect(auditLogFindFirst).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
