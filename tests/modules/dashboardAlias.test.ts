import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regresión del build roto: `/dashboard` renderizaba `AtlasDashboard`
 * (cliente, usa `useSearchParams`) sin un límite `Suspense`, lo que hacía
 * fallar el prerender ("Error occurred prerendering page /dashboard").
 * Mismo patrón de lectura de fuente que `tests/modules/moduleNavigation.test.ts`
 * (sin renderer DOM en este repo).
 */

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../../", relativePath), "utf8");
}

describe("/dashboard (alias histórico de ATLAS) queda bajo Suspense", () => {
  it("importa el mismo AtlasDashboard real, no una copia demo", () => {
    const source = readSource("src/app/dashboard/page.tsx");
    expect(source).toMatch(
      /import AtlasDashboard from "@\/modules\/atlas\/components\/AtlasDashboard"/
    );
  });

  it("envuelve AtlasDashboard en Suspense, igual que /modules/atlas", () => {
    const dashboardSource = readSource("src/app/dashboard/page.tsx");
    const atlasModuleSource = readSource("src/app/modules/atlas/page.tsx");

    for (const source of [dashboardSource, atlasModuleSource]) {
      expect(source).toMatch(/<Suspense fallback=\{null\}>\s*<AtlasDashboard \/>\s*<\/Suspense>/);
    }
  });

  it("no introduce un fallback demo (mantiene fallback={null} como /modules/atlas)", () => {
    const source = readSource("src/app/dashboard/page.tsx");
    expect(source).not.toMatch(/Cargando|Loading|demo/i);
  });
});
