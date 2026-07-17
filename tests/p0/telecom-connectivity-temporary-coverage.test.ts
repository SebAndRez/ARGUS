import { describe, expect, it } from "vitest";
import { TELECOM_POI_CATEGORIES } from "@/lib/connectivity/telecomConnectivityService";
import { criticalPoiCategoryRegistry, isCriticalPoiCategoryId } from "@/lib/criticalPoi/criticalPoiCategoryRegistry";

/**
 * Puntos de conectividad temporal (carro movil, wifi de emergencia, punto de
 * carga — spec ARGUS v1.0.3.6 §11) se persisten como `CriticalPoi`, no una
 * tabla nueva: las tres categorias deben existir en el registro de
 * categorias criticas para que el resto del pipeline (mapa, FENIX) las
 * reconozca.
 */

describe("categorias de conectividad temporal", () => {
  it("las 3 categorias telecom_* estan registradas en criticalPoiCategoryRegistry", () => {
    for (const category of TELECOM_POI_CATEGORIES) {
      expect(isCriticalPoiCategoryId(category)).toBe(true);
    }
  });

  it("cada categoria telecom_* tiene una definicion completa (label, prioridad, tags)", () => {
    for (const category of TELECOM_POI_CATEGORIES) {
      const definition = criticalPoiCategoryRegistry.find((item) => item.id === category);
      expect(definition).toBeDefined();
      expect(definition?.label).toBeTruthy();
      expect(definition?.priority).toBeTruthy();
      expect(definition?.tags.length).toBeGreaterThan(0);
    }
  });

  it("exactamente 3 categorias telecom_*, sin duplicados", () => {
    expect(TELECOM_POI_CATEGORIES).toEqual([
      "telecom_mobile_unit",
      "telecom_emergency_wifi",
      "telecom_charging_point",
    ]);
  });
});
