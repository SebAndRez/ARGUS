import { describe, expect, it } from "vitest";
import { performCustosSearch } from "../../src/modules/custos/custosSearch";
import { resolveCustosModuleAccess } from "../../src/modules/custos/custosAccess";
import { custosDemoReason } from "../../src/modules/custos/data";
import { auditCustosAction } from "../../src/modules/custos/custosAudit";
import { withEnv } from "../helpers/withEnv";

/**
 * ARGUS Prompt 18 — CUSTOS stabilization. CUSTOS is a real, correctly-gated
 * (police/authority) search *interface* over entirely simulated data —
 * `performCustosSearch` always returns the fixed demo person set, never a
 * real backend. The access gate (role + operational reason) must remain
 * real even though the search results behind it are not.
 */

describe("CUSTOS — el control de acceso es real y se aplica antes de cualquier búsqueda", () => {
  it("un rol no policial/autoridad no puede entrar al módulo", () => {
    expect(resolveCustosModuleAccess("CITIZEN").canEnter).toBe(false);
    expect(resolveCustosModuleAccess("OPERATOR").canEnter).toBe(false);
  });

  it("POLICE, AUTHORITY y ADMIN sí pueden entrar", () => {
    expect(resolveCustosModuleAccess("POLICE").canEnter).toBe(true);
    expect(resolveCustosModuleAccess("AUTHORITY").canEnter).toBe(true);
    expect(resolveCustosModuleAccess("ADMIN").canEnter).toBe(true);
  });
});

describe("CUSTOS — la búsqueda siempre es demo, y lo declara en cada respuesta", () => {
  it("un rol autorizado con motivo válido obtiene siempre el mismo set demo, sin importar el criterio de búsqueda", () => {
    const responseA = performCustosSearch({
      searchType: "identity",
      query: "cualquier nombre",
      operationalReason: custosDemoReason,
      userRole: "POLICE",
      userId: "officer-1",
    });
    const responseB = performCustosSearch({
      searchType: "identity",
      query: "un nombre completamente distinto",
      operationalReason: custosDemoReason,
      userRole: "POLICE",
      userId: "officer-1",
    });
    expect(responseA.redacted).toBe(true);
    expect(responseA.results.map((r) => r.id)).toEqual(responseB.results.map((r) => r.id));
  });

  it("un rol no autorizado no obtiene resultados, incluso con motivo operacional válido", () => {
    const response = performCustosSearch({
      searchType: "identity",
      query: "algo",
      operationalReason: custosDemoReason,
      userRole: "CITIZEN",
      userId: "u1",
    });
    expect(response.results).toEqual([]);
    expect(response.redacted).toBe(true);
  });

  it("sin motivo operacional válido (descripción vacía), la búsqueda se rechaza sin devolver resultados", () => {
    const response = performCustosSearch({
      searchType: "identity",
      query: "algo",
      operationalReason: { ...custosDemoReason, description: "" },
      userRole: "POLICE",
      userId: "officer-1",
    });
    expect(response.results).toEqual([]);
  });
});

describe("CUSTOS — la auditoría se dispara tanto en acceso concedido como denegado", () => {
  it("no lanza excepción al auditar un acceso concedido o denegado (fuera de producción)", () => {
    withEnv({ NODE_ENV: "development" }, () => {
      expect(() =>
        auditCustosAction({ userId: "u1", userRole: "POLICE", action: "module_opened", redacted: true })
      ).not.toThrow();
      expect(() =>
        auditCustosAction({ userId: "u2", userRole: "CITIZEN", action: "access_denied", redacted: true })
      ).not.toThrow();
    });
  });
});
