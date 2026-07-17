import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CodigoAzulStructuralChangeError,
  extractLeadingNumericId,
  parseAlberguesPage,
} from "@/lib/criticalPoi/codigoAzul/codigoAzulHtmlParser";

/**
 * Parser HTML de Codigo Azul contra fixtures reales capturados del sitio
 * oficial (2026-07-17, `tests/fixtures/codigo-azul/`) — no HTML sintetico
 * a mano, para que el test refleje el markup real (thead/tbody, atributos
 * data-url, fila "Sin resultados").
 */

const FIXTURES_DIR = join(__dirname, "..", "fixtures", "codigo-azul");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

describe("parseAlberguesPage — pagina normal", () => {
  const parsed = parseAlberguesPage(readFixture("page-1.html"));

  it("extrae las 10 filas de la primera pagina", () => {
    expect(parsed.isEmptyResultsPage).toBe(false);
    expect(parsed.rows).toHaveLength(10);
  });

  it("extrae todas las columnas de la primera fila correctamente", () => {
    const [first] = parsed.rows;
    expect(first.region).toBe("Arica y Parinacota");
    expect(first.tipo).toBe("Albergue");
    expect(first.direccion).toBe("ARTURO BUITANO 156, ARICA");
    expect(first.componente).toBe("Plan Protege");
    expect(first.comuna).toBe("Arica");
    expect(first.institucion).toBe("ONG de Desarrollo e Integración Social Maria Olga Ester");
    expect(first.horario).toBe("24 Horas");
    expect(first.cuposRaw).toBe("20");
  });

  it("extrae xy=LNG,LAT del data-url en el orden correcto (longitud primero)", () => {
    const [first] = parsed.rows;
    expect(first.sourceCoordinates).toEqual({ lat: -18.46843, lng: -70.30483 });
  });

  it("preserva '24 Horas' como texto de horario tal cual, sin interpretarlo", () => {
    expect(parsed.rows.every((row) => row.horario === "24 Horas")).toBe(true);
  });

  it("100% de las filas de muestra traen coordenadas de la fuente", () => {
    expect(parsed.rows.every((row) => row.sourceCoordinates !== null)).toBe(true);
  });
});

describe("parseAlberguesPage — ultima pagina parcial", () => {
  it("extrae las 9 filas de la ultima pagina (menos que el tamaño de pagina)", () => {
    const parsed = parseAlberguesPage(readFixture("page-9-partial.html"));
    expect(parsed.isEmptyResultsPage).toBe(false);
    expect(parsed.rows).toHaveLength(9);
  });
});

describe("parseAlberguesPage — pagina vacia (fin de paginacion)", () => {
  it("detecta 'Sin resultados' como fin de paginacion, no como error", () => {
    const parsed = parseAlberguesPage(readFixture("empty-page.html"));
    expect(parsed.isEmptyResultsPage).toBe(true);
    expect(parsed.rows).toHaveLength(0);
  });
});

describe("parseAlberguesPage — cambio estructural", () => {
  it("lanza CodigoAzulStructuralChangeError cuando cambia un encabezado esperado", () => {
    expect(() => parseAlberguesPage(readFixture("page-structural-change.html"))).toThrow(CodigoAzulStructuralChangeError);
  });

  it("lanza CodigoAzulStructuralChangeError cuando no hay tabla en absoluto", () => {
    expect(() => parseAlberguesPage("<html><body>Sitio caido</body></html>")).toThrow(CodigoAzulStructuralChangeError);
  });
});

describe("extractLeadingNumericId", () => {
  it("extrae el id sin espacio antes del guion", () => {
    expect(extractLeadingNumericId("484697-Albergue ONG de Desarrollo (Arturo Buitano #156) 2026")).toBe("484697");
  });

  it("extrae el id con espacio-guion-espacio", () => {
    expect(extractLeadingNumericId("467477 - Albergue Protege Arica Corporación COFEDUC")).toBe("467477");
  });

  it("extrae el id con guion-espacio", () => {
    expect(extractLeadingNumericId("485957- Albergue Fundación UNAP Iquique")).toBe("485957");
  });

  it("retorna undefined cuando el nombre no empieza con un numero", () => {
    expect(extractLeadingNumericId("Albergue sin identificador numerico")).toBeUndefined();
  });
});
