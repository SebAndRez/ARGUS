# ARGUS — Baseline del repositorio (antes/después, Prompt 20)

| Indicador | Antes | Después |
|---|---|---|
| Archivos TS/TSX en `src/` | 1089 | 1037 |
| Archivos de test en `tests/` | 42 | 75 |
| Tests totales ejecutados (`npm run test`) | 510 | 839 |
| Tests P0 (`npm run test:p0`) | 131 | 131 (sin cambios — ningún archivo P0 fue tocado en esta tarea) |
| Warnings de lint | 26 (0 errores) | 20 (0 errores) |
| — de los cuales `@typescript-eslint/no-unused-vars` | 5 | 0 |
| — de los cuales `react-hooks/set-state-in-effect` | 20 (preexistentes) | 20 (preexistentes, sin cambios — deuda diferida documentada) |
| Errores de `tsc --noEmit` | 46 (confinados a 3 archivos bajo `src/lib/knowledge-intake/__tests__/`) | 0 |
| Dependencias directas (`package.json`) | 9 | 8 (`maplibre-gl` eliminada) |
| Dependencias de desarrollo | 13 | 13 (sin cambios) |
| Archivos bajo `src/**/__tests__/` (convención muerta) | 33 | 0 |
| Build de producción (`npm run build`) | No verificado en esta tarea (baseline no capturado) | Falla en el prerender de `/dashboard` — **preexistente**, no causado por este prompt (ver `ARGUS_REMAINING_TECHNICAL_DEBT.md` P1) |

## Código legacy eliminado (conteo)

- 5 archivos (`src/lib/ingest/*`)
- 9 archivos (adaptadores stub)
- 4 archivos (bridges NEXUS)
- 1 archivo (`FenixDashboard.tsx`)
- 2 funciones muertas (no archivos): `persistCorrelations()`, `upsertEmbeddingRecord()`
- 1 dependencia (`maplibre-gl`)

**Total: 21 archivos eliminados, 2 funciones eliminadas, 1 dependencia eliminada.**

## Código legacy renombrado

- 2 archivos: `alertPromotionEngine.ts` (colisión) → `chileAlertPromotionEngine.ts` + `globalAlertPromotionEngine.ts`

## Código legacy movido/convertido (no eliminado)

- 33 archivos de test movidos de `src/**/__tests__/` a `tests/<área>/`, convertidos de una convención muerta (`runXTest()`) a Vitest real. Ningún archivo de test fue eliminado — todos sus assertions se preservaron.

## Código legacy conservado deliberadamente (ver `ARGUS_REMAINING_TECHNICAL_DEBT.md`)

- 51 helpers de contexto (cuarentena — lógica real no conectada)
- Geometría chilena en el bundle cliente (bloqueo documentado, no arreglo)
- 6 rutas API huérfanas (evidencia insuficiente para eliminar)
- Modelos Prisma `ExternalEventCorrelation`/`KnowledgeEmbeddingRecord` (intactos, sin escritor activo)

## Metodología de medición

Todos los conteos "antes" se capturaron antes de cualquier cambio de esta
tarea (`git status --short` + `find`/`npx eslint .`/`npx tsc --noEmit`
ejecutados como primer paso). Todos los conteos "después" se capturaron al
finalizar, con la suite completa verde. No se afirma ninguna mejora de
rendimiento del bundle sin medición real — el bundle de producción no pudo
medirse porque `npm run build` falla en el prerender por el problema
preexistente documentado arriba (no relacionado con esta tarea).
