# ARGUS — Línea Base de Pruebas Automatizadas

> Alcance de este documento: la infraestructura mínima de pruebas instalada para proteger las tres correcciones P0 (autenticación de endpoints mutantes, guard destructivo de `db:seed`, exclusión de datos demo en `/api/notifications`). No es una suite completa para todo ARGUS.

## 1. Runner elegido

**Vitest** (`^4.1.10`), única dependencia nueva instalada. Motivos: stack 100% TypeScript, ESM nativo, mocking integrado (`vi.mock`/`vi.fn`/`vi.stubEnv`/`vi.stubGlobal`), ejecuta en Node sin navegador, y no requiere una segunda herramienta de aserciones. No se instaló Jest, Cypress, Playwright, Testing Library ni jsdom — ninguno de los tres bloques P0 necesita DOM ni un navegador real.

## 2. Scripts disponibles (`package.json`)

| Script | Comando | Uso |
|---|---|---|
| `npm run test` | `vitest run` | Corre toda la suite una vez, código de salida ≠0 si falla. Apto para CI. |
| `npm run test:watch` | `vitest` | Modo watch para desarrollo local. |
| `npm run test:p0` | `vitest run tests/p0` | Corre solo la suite de regresión P0. |

Ningún otro script de `package.json` fue modificado salvo `db:seed` (Prompt 2, no forma parte de esta tarea).

## 3. Ubicación de los tests

```
tests/
  setup.ts              — guard global de red (bloquea fetch() no mockeado)
  helpers/
    withEnv.ts           — guardar/establecer/restaurar process.env explícitamente
  p0/
    endpoint-auth.test.ts          — Prompt 1 (3 endpoints mutantes)
    seed-guard.test.ts             — Prompt 2 (guard de seed)
    notification-demo-guard.test.ts — Prompt 3 (exclusión de datos demo)
```

Esta es la convención oficial para tests nuevos en ARGUS: **`tests/<área>/<archivo>.test.ts`**, con helpers compartidos en `tests/helpers/`. Los tests históricos bajo `src/**/__tests__/*.test.ts` NO siguen esta convención y no se migraron en esta tarea (ver §7).

## 4. Configuración (`vitest.config.ts`)

- **Entorno**: `node` (sin DOM, sin jsdom — ninguno de los tres bloques P0 toca UI).
- **Alias**: `@/*` → `./src/*`, igual que `tsconfig.json`, resuelto vía `resolve.alias` (sin plugin adicional).
- **Patrón incluido**: únicamente `tests/**/*.test.ts`. Esto excluye — a propósito, no por accidente — los 30 archivos existentes en `src/**/__tests__/*.test.ts`, que usan una convención manual (`runXTest()`) o `describe`/`it` sin import (ver §7). Ampliar el patrón para incluirlos es un paso futuro deliberado, no algo que deba ocurrir accidentalmente al correr `npm run test`.
- **Exclusiones explícitas**: `node_modules`, `.next`, `dist`, `build`.
- **`globals: false`**: cada test importa `describe`/`it`/`expect`/`vi` explícitamente desde `"vitest"`. Se eligió así (en vez de `globals: true` + `vitest/globals` en `tsconfig.json`) para no tocar el `tsconfig.json` del proyecto ni interactuar de ninguna forma con los archivos históricos que ya tienen `describe`/`it` sin resolver — su estado de typecheck no cambia ni para mejor ni para peor.
- **Manejo de variables de entorno**: `env: {}` — esta configuración **no llama a `loadEnv`** ni carga `.env`/`.env.local` de ninguna forma. `process.env` en un test arranca con lo que el shell invocador ya tenga. Ningún test de esta suite depende de eso: los tests de `seed-guard.test.ts` llaman a una función pura (`evaluateDatabaseSafetyForSeed`) que recibe cada variable como parámetro explícito, nunca lee `process.env` ni toca el sistema de archivos; los tests de `notification-demo-guard.test.ts` usan `tests/helpers/withEnv.ts` para fijar y restaurar exactamente las variables que necesitan (incluyendo dejarlas *ausentes*, no solo vacías) alrededor de cada caso.
- **`restoreMocks`/`unstubEnvs`/`unstubGlobals`: `true`** — cada test empieza limpio, sin depender del orden de ejecución de otros tests.

## 5. Aislamiento de red y base de datos

- `tests/setup.ts` reemplaza el `fetch` global por una función que **lanza una excepción inmediatamente** si se invoca sin mock explícito — cualquier código que intente alcanzar Overpass, Supabase REST, o cualquier API externa durante un test falla ruidosamente en el acto, en vez de intentar una conexión real.
- Ningún test de la suite P0 importa `@/lib/prisma` directamente ni indirectamente:
  - `endpoint-auth.test.ts` mockea `@/services/authService` (que internamente usa `next/headers` + Prisma) y los dos módulos de persistencia/red (`knowledgePersistenceService`, `criticalPoiOsmSync`) **antes** de importar las rutas — como Vitest reemplaza el módulo completo en el grafo de módulos, el código real de esos archivos (y su propio import de `@/lib/prisma`) nunca se ejecuta.
  - `seed-guard.test.ts` importa únicamente `scripts/lib/databaseSafety.ts`, que por diseño (ver comentario en el propio archivo) no importa `@prisma/client` ni `src/lib/prisma` en ningún punto. **Nunca se importa `prisma/seed.ts`** — esto satisface por evitación la "regla crítica" de no disparar el proceso principal del seed al importar el guard.
  - `notification-demo-guard.test.ts` importa `notificationCenterEngine.ts` y `productionGuard.ts`, ninguno de los cuales toca Prisma o red.
- **Prohibición explícita**: ningún test de esta suite puede usar la base de datos compartida (Supabase) ni credenciales reales. Ver §8 para la confirmación de que esto se cumplió en la práctica.

## 6. Cómo ejecutar la suite P0

```bash
npm run test:p0
```

Para la suite completa (hoy, idéntica a la P0 — no hay más tests bajo `tests/`):

```bash
npm run test
```

Para desarrollo iterativo:

```bash
npm run test:watch
```

## 7. Cómo escribir nuevos tests

1. Ubicar el archivo bajo `tests/<área>/<nombre>.test.ts` (crear una nueva subcarpeta de área si corresponde; no dupliques `tests/p0/` para algo que no sea P0).
2. Importar explícitamente desde `"vitest"`: `import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";` (no depender de globals).
3. Mockear en el **límite de I/O real** (Prisma, `next/headers`, `fetch`, servicios de persistencia/red), no la lógica de negocio que se quiere probar de verdad — así el test verifica comportamiento (código de estado, llamadas a mocks) y no detalles de implementación accidentales.
4. Si el test necesita variables de entorno, usar `tests/helpers/withEnv.ts` (permite representar una variable *ausente*, no solo vacía) o `vi.stubEnv`/`vi.unstubAllEnvs` cuando alcance con establecer un valor.
5. Nunca importar un archivo que ejecute lógica de arranque real al importarse (p. ej. `prisma/seed.ts`) — si hace falta probar su comportamiento, extraer la lógica a una función pura importable por separado (patrón ya usado en `scripts/lib/databaseSafety.ts`).
6. Cada test debe afirmar comportamiento observable (código de respuesta, contenido, llamadas a mocks) — no `expect(sourceCode).toContain(...)`.

## 8. Inventario de tests históricos (`src/**/__tests__/*.test.ts`)

30 archivos preexistentes, **ninguno se ejecuta hoy** bajo `npm run test`/`npm run test:p0` (fuera del patrón `include` a propósito). Ninguno fue modificado en esta tarea.

| Estilo | Cantidad | Ejemplos | ¿Ejecutable hoy? | Estado recomendado |
|---|---|---|---|---|
| Manual `export function run*Test()` (retorna `{passed, details}`, nunca invocado por nada) | 26 | `rbac.test.ts`, `runAllPolicy.test.ts`, `incidentNormalizer.test.ts`, `eonetAdapter.test.ts`, `iocSlsmfAdapter.test.ts` (variante `async`), `noaaCoopsAdapter.test.ts`, `usgsWaterAdapter.test.ts`, y 19 más — ver lista completa abajo | Compilable (mayoría), no ejecutado por nada | Pendiente de migración: convertir cada `runXTest()` en un `it(...)` real dentro de `tests/`, o retirar si ya no aporta valor |
| Jest-global sin import (`describe`/`it`/`expect` sin resolver) | 4 | `osmCategoryRegistry.test.ts`, `osmOverpassAdapter.test.ts`, `smithsonianGvpAdapter.test.ts`, `usgsEarthquakeImpactAdapter.test.ts` | **No** — falla `tsc --noEmit` con `TS2304`/`TS2582` (preexistente, sin cambios en esta tarea) | Roto / pseudotest: requiere migrar a imports explícitos de `vitest` antes de poder ejecutarse |
| — con error de tipos adicional en sus propios fixtures | 1 (`usgsEarthquakeImpactAdapter.test.ts`) | — | No (además del punto anterior) | Requiere corregir el fixture (`geometry.coordinates` como tupla `[number, number]`, no `number[]`) al migrarlo |

Lista completa de los 26 archivos de convención manual: `src/lib/argus/__tests__/operationalHypothesisEngine.test.ts`, `src/lib/knowledge-intake/__tests__/{eonetAdapter,incidentNormalizer,iocSlsmfAdapter,lessonExtractor,noaaCoopsAdapter,noaaNceiTsunamiAdapter,noaaStormEventsAdapter,nwsAdapter,openAqAdapter,openFemaAdapter,openMeteoAdapter,operationalReasoningEngine,similarityEngine,sourceScoring,usgsVolcanoHansAdapter,usgsWaterAdapter,usgsWaterMapLayer}.test.ts`, `src/lib/risk/__tests__/sourceWeighting.test.ts`, `src/lib/security/__tests__/rbac.test.ts`, `src/lib/source-governance/__tests__/{crossSourceCorroboration,incidentGuardrails,mapLayerTaxonomy,runAllPolicy,sourceGovernanceRegistry,sourceVisibility}.test.ts`, `src/lib/source-router/__tests__/sourceIntelligenceRouter.test.ts`, `src/lib/weather/__tests__/severeWeatherClassifier.test.ts`, `src/services/__tests__/auditService.test.ts`.

**Nota especial — `src/lib/security/__tests__/rbac.test.ts`**: prueba una copia manual del arreglo de roles en vez del guard real (`apiGuards.ts`/`rbac.ts`), tal como ya había identificado la auditoría previa. No se corrigió en esta tarea (fuera de alcance); la protección real de autorización para los 3 endpoints P0 queda cubierta por `tests/p0/endpoint-auth.test.ts`, que sí ejercita el código real.

Estos 30 archivos **no deben reportarse como tests activos** hasta que se migren explícitamente — no están ocultos (siguen en el repositorio, documentados aquí), simplemente no forman parte del patrón `include` inicial.

## 9. Prohibiciones

- **Nunca** apuntar `DATABASE_URL`/`DIRECT_URL` de un test a la base compartida de Supabase, ni siquiera para "probar rápido" — todos los tests P0 son puros o mockeados precisamente para que esto nunca sea necesario.
- **Nunca** dejar que un test alcance una red real — `tests/setup.ts` ya lo bloquea globalmente; si un test nuevo necesita simular una respuesta de red, mockear el módulo que llama a `fetch`, no confiar en que el `fetch` global "por defecto" haga algo razonable.
- **Nunca** importar `prisma/seed.ts` desde un test.

## 10. Resultado inicial de la suite (fecha de esta línea base)

```
npm run test:p0   → 3 archivos, 44 tests, todos aprobados
npm run test      → idéntico (mismo include pattern)
npx tsc --noEmit  → 0 errores nuevos introducidos por esta tarea; errores preexistentes intactos
                    (osmCategoryRegistry.test.ts, osmOverpassAdapter.test.ts,
                    usgsEarthquakeImpactAdapter.test.ts — los 3 ya fallaban antes de esta tarea)
npm run lint      → 24 warnings (idéntico conteo/contenido a antes de esta tarea), 0 errores
```

Ver `docs/audit/ARGUS_MASTER_BACKLOG.md` para el ítem P1 relacionado ("instalar un test runner real") — esta línea base lo resuelve parcialmente (runner instalado, 3 bloques P0 cubiertos); la migración de los 30 tests históricos permanece pendiente y no se marca como resuelta en los documentos de auditoría todavía, según instrucción explícita de esta tarea.
