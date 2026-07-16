# ARGUS — Cierre de deuda técnica (Prompt 20)

> Limpieza controlada tras los Prompts 1-19. Cada eliminación de esta tarea
> tiene evidencia de cero consumidores verificada de forma independiente
> (no se confió en la auditoría del 13 de julio de 2026 como verdad
> automática — varios hallazgos de ese documento ya estaban resueltos o
> eran menos completos de lo que parecían). Nada se commiteó, pusheó ni
> desplegó. Cero cambios a `prisma/schema.prisma`.

## Deuda inicial (de `ARGUS_TECHNICAL_DEBT.md`/`ARGUS_MASTER_BACKLOG.md`) — qué se confirmó vigente

| Ítem original | Estado al empezar esta tarea | Resultado |
|---|---|---|
| `src/lib/ingest/*` framework legacy sin importadores | Confirmado: 5 archivos, cero importadores externos | **Eliminado** |
| 9 adaptadores stub sin referencia externa (backlog P3#1) | Confirmado: los 9 devuelven solo `plannedAdapterResult()` | **Eliminados** |
| Colisión `alertPromotionEngine.ts` (dos archivos, mismo nombre) | Confirmado: ambos siguen activos, ambos importados por `globalWatchEngine.ts` simultáneamente | **Renombrados** (no eliminados — ambos siguen siendo necesarios) |
| Tipos de severidad duplicados | Confirmado: `RouteHazardSeverity`/`HazardSeverity`/`WeatherSeverity` son valor-idénticos a tipos canónicos, sin consumidores propios | **Alias `@deprecated`** aplicados a los 3 |
| `EventSeverity`/`IncidentSeverity`/`ArgusSeverity`/`ArgusIncidentSeverity` | Re-verificados: semánticamente distintos (mayúsculas vs. minúsculas, sets de valores distintos, consumidores amplios independientes) | **No tocados** — fusionarlos sería el "reemplazo ciego" que la tarea prohíbe explícitamente |
| Bridges NEXUS (4 archivos) | Confirmado: cero importadores; `argus-nexus` ya es `maturity: "planned"` (Prompt 18) | **Eliminados** |
| FÉNIX legacy (`FenixDashboard.tsx`) | Confirmado: cero importadores; ruta canónica (`FenixOfficialGate` → `FenixTwinPanel`) intacta | **Eliminado** |
| Tablas solo-escritura (`ExternalEventCorrelation`, `KnowledgeEmbeddingRecord`) | Confirmado: sus únicas funciones escritoras (`persistCorrelations`, `upsertEmbeddingRecord`) no tienen NINGÚN llamador — no es que la tabla no se lea, es que ni siquiera se escribe hoy | **Funciones eliminadas** (tablas/modelos intactos, sin migración) |
| 32 tests de convención propia (`runXTest()`) | Confirmado: 33 archivos (no 32), Vitest nunca los ejecuta, pero contienen aserciones reales contra código real y activo | **Convertidos** a Vitest real, movidos a `tests/` |
| Resumen de notificaciones duplicado (Prompt 11) | Re-verificado: **ya estaba resuelto** — una sola función (`buildNotificationSummary`), una sola regla de crítico/categoría/lifecycle/demo. El documento de auditoría estaba desactualizado en este punto. | Sin acción — documentado como ya resuelto |
| Command Center sintético | Re-verificado: ya falla cerrado (`isDemoDataAllowed()`), ya etiquetado "Demo" en ATLAS, ya documentado en `ARGUS_COMMAND_CENTER_STATUS.md` | Sin acción — ya correcto |
| Geometría chilena ~1.13MB en el bundle cliente | Confirmado: sigue llegando al cliente vía `page.tsx` → `demoArgusEvents.ts` → `argusGeometryResolver.ts` | **Documentado, no corregido** — arreglarlo de forma segura toca el timing de inicialización del mapa principal; bloqueo explícito documentado (§27 del prompt lo permite) |
| Warnings de lint | 25-26 warnings (0 errores) al empezar | **5 `no-unused-vars` corregidos**; 20 `react-hooks/set-state-in-effect` documentados como preexistentes/diferidos |

## Corrección importante respecto al plan original de esta tarea

Una investigación preliminar (con menor profundidad de lectura de código) había clasificado 22 archivos "helper de contexto" (GVP/IOC/NOAA/OpenAQ/tsunami/ceniza volcánica) como `delete_confirmed` por tener cero importadores. Al re-verificar exhaustivamente **con lectura de contenido real, no solo grep de imports**, se encontraron en realidad **51 archivos** en esa categoría (no 22), y — más importante — su contenido es lógica de dominio real y deliberada (scoring, cross-referencing, caveats explícitos), no stubs ni placeholders. Esto coincide exactamente con un hallazgo ya documentado en el Prompt 18 para `src/lib/aura/osmMedicalContext.ts` ("integración real pero dormida... no es candidato a eliminar"). Los 51 archivos fueron **reclasificados a `quarantine`** (conservados, documentados, no eliminados) — ver `ARGUS_REMAINING_TECHNICAL_DEBT.md` para el inventario completo. Esta es exactamente la clase de auto-corrección que la tarea exige ("no use la auditoría como verdad automática").

## Consolidaciones realizadas

- **`alertPromotionEngine.ts` → 2 nombres explícitos**: `src/lib/incidents/chileAlertPromotionEngine.ts` (SENAPRED/Chile, `promoteChileOfficialAlerts`) y `src/lib/vigia/globalAlertPromotionEngine.ts` (amenazas globales, `evaluateIncidentPromotion`/`mergeCorroboratingEvents`). 6 sitios de import actualizados, cero cambio de lógica.
- **Severidad**: `RouteHazardSeverity`, `HazardSeverity`, `WeatherSeverity` son ahora alias `@deprecated` de `ArgusIngestionSeverity`/`NwsSeverity` — mismo valor, una sola fuente de verdad, cero cambio de comportamiento (los valores ya eran idénticos).
- **Guards**: `apiGuards.ts` ahora exporta `OPERATOR_ROLES`/`ADMIN_ROLES`/`VERIFIED_USER_ROLES`/`MEDICAL_ACCESS_ROLES` como constantes nombradas — el test RBAC convertido importa `OPERATOR_ROLES` directamente en vez de mantener una copia manual que podía desincronizarse silenciosamente (el hallazgo exacto del §19 del prompt).

## Tests

33 archivos convertidos de `export function runXTest()` (nunca ejecutados por Vitest) a `describe`/`it`/`expect` reales en `tests/`, preservando cada aserción existente sin diluirlas en un solo booleano. 3 de los 33 arreglan además errores reales preexistentes de `tsc --noEmit` (`osmCategoryRegistry`, `osmOverpassAdapter`, `usgsEarthquakeImpactAdapter`) como efecto colateral correcto de la conversión.

## Warnings

5 `@typescript-eslint/no-unused-vars` corregidos mecánicamente (cero cambio de comportamiento). 20 `react-hooks/set-state-in-effect` quedan documentados como deuda diferida — matching exactamente el mismo patrón ya presente en el panel `/admin/source-health` ya en producción; corregirlos requiere análisis de comportamiento por-hook que la propia tarea advierte no apresurar.

## Dependencias

`maplibre-gl` (^5.24.0) eliminada de `package.json` — cero referencias en `src/`, `scripts/` o config; el stack de mapas es Leaflet + Three.js. `package-lock.json` sincronizado vía `npm install` (24 paquetes transitivos removidos).

## Deuda diferida (ver `ARGUS_REMAINING_TECHNICAL_DEBT.md` para el detalle completo)

Riesgos y decisiones pendientes: geometría chilena en el bundle, 51 helpers de contexto en cuarentena, 6 rutas API huérfanas candidatas (no eliminadas — no se puede descartar consumo externo desde un grep solo-repo), colisión conceptual `knowledgeMemoryEngine.ts` (array demo) vs. `KnowledgeEmbeddingRecord` (tabla real), 20 warnings `set-state-in-effect`, `reason` sin persistir en `applyStrike()`.
