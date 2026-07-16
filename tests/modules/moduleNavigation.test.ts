import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ARGUS Prompt 17 §34 — navegación cruzada entre los cuatro módulos.
 * Sin renderer DOM en este repo (Vitest corre en `environment: "node"`,
 * sin `@testing-library/react`), estas pruebas leen el texto fuente real
 * (mismo patrón que `tests/p0/fenix-canonicalization.test.ts`) para
 * verificar: el `id` canónico viaja como query param validado (nunca el
 * incidente completo serializado), y cada enlace apunta al módulo correcto.
 */

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../../", relativePath), "utf8");
}

describe("Navegación cruzada por ID canónico (Prompt 17 §25, §34)", () => {
  it("ATLAS → VIGÍA usa ?incidentId=, nunca serializa el incidente completo", () => {
    const source = readSource("src/modules/atlas/components/AtlasDashboard.tsx");
    expect(source).toMatch(/\/modules\/vigia\?incidentId=\$\{encodeURIComponent\(selectedCanonicalIncidentId\)\}/);
  });

  it("VIGÍA → ORÁCULO y VIGÍA → TALOS usan ?incidentId=", () => {
    const source = readSource("src/modules/vigia/components/VigiaCanonicalIncidentDetail.tsx");
    expect(source).toMatch(/\/modules\/oraculo\?incidentId=/);
    expect(source).toMatch(/\/modules\/talos\?incidentId=/);
  });

  it("ORÁCULO → VIGÍA ('ver incidente base') usa ?incidentId=", () => {
    const source = readSource("src/modules/oraculo/components/OraculoCanonicalIncidentPanel.tsx");
    expect(source).toMatch(/\/modules\/vigia\?incidentId=/);
  });

  it("TALOS → VIGÍA ('ver evidencia') usa ?incidentId=", () => {
    const source = readSource("src/modules/talos/components/TalosCanonicalIncidentPanel.tsx");
    expect(source).toMatch(/\/modules\/vigia\?incidentId=/);
  });

  it("los cuatro dashboards leen ?incidentId= vía useSearchParams, nunca lo mezclan con localStorage", () => {
    for (const file of [
      "src/modules/atlas/components/AtlasDashboard.tsx",
      "src/modules/vigia/components/VigiaDashboard.tsx",
      "src/modules/oraculo/components/OraculoDashboard.tsx",
      "src/modules/talos/components/TalosDashboard.tsx",
    ]) {
      const source = readSource(file);
      expect(source).toMatch(/useSearchParams/);
      expect(source).toMatch(/searchParams\.get\("incidentId"\)/);
      expect(source).not.toMatch(/localStorage/);
    }
  });

  it("las cuatro páginas de módulo envuelven el dashboard en Suspense (useSearchParams lo requiere)", () => {
    for (const file of [
      "src/app/modules/atlas/page.tsx",
      "src/app/modules/vigia/page.tsx",
      "src/app/modules/oraculo/page.tsx",
      "src/app/modules/talos/page.tsx",
    ]) {
      const source = readSource(file);
      expect(source).toMatch(/Suspense/);
    }
  });

  it("los cuatro módulos usan el mismo componente compartido (CanonicalIncidentPanel), ninguno reimplementa su propio mapeador", () => {
    for (const file of [
      "src/modules/atlas/components/AtlasDashboard.tsx",
      "src/modules/vigia/components/VigiaDashboard.tsx",
      "src/modules/oraculo/components/OraculoCanonicalIncidentPanel.tsx",
      "src/modules/talos/components/TalosCanonicalIncidentPanel.tsx",
    ]) {
      const source = readSource(file);
      expect(source).toMatch(/CanonicalIncidentPanel/);
    }
  });

  it("ATLAS no cuenta Source Health como amenaza territorial: el resumen canónico solo lee summaries del gateway, no CommandSourceHealth", () => {
    const source = readSource("src/modules/atlas/components/AtlasDashboard.tsx");
    const canonicalSummaryBlock = source.slice(
      source.indexOf("canonicalIncidentSummary = useMemo"),
      source.indexOf("canonicalIncidentSummary = useMemo") + 700
    );
    expect(canonicalSummaryBlock).not.toMatch(/CommandSourceHealth|sourceSummary\.status/);
  });

  it("VIGÍA solo expone Source Health a roles validadores (canValidate), nunca públicamente", () => {
    const source = readSource("src/modules/vigia/components/VigiaDashboard.tsx");
    expect(source).toMatch(/VigiaSourceHealthMiniPanel visible=\{canValidate\}/);
  });
});
