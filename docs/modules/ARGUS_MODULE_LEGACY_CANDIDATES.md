# ARGUS — Candidatos a limpieza técnica (HERMES, ARCA, AURA, CUSTOS, NEXUS)

> Prompt 18 §34. Inventario únicamente en su origen — ver "Resolución (Prompt 20)" abajo para qué se actuó y qué sigue pendiente. Cada entrada indica por qué se creyó candidata y qué evidencia respaldaba que no tenía consumidor real en ese momento.

## Resolución (Prompt 20)

- **Los 4 bridges NEXUS de la sección siguiente fueron eliminados** (re-verificado: seguían con cero importadores). `tests/p0/nexus-stabilization.test.ts` se actualizó para afirmar que los archivos ya no existen, en vez de afirmar que existen pero sin importador.
- **Todo lo demás en este documento (7 bridges CUSTOS, 9 bridges ARCA/HERMES/AURA, 2 funciones muertas de CUSTOS, rutas huérfanas de AURA, el modelo de acceso paralelo `AURA_PRO`, y la integración dormida OSM/CriticalPoi) NO fue tocado en el Prompt 20** — esa tarea se enfocó en los candidatos con evidencia más fuerte y alcance más amplio del repositorio (ver `docs/maintenance/ARGUS_DELETION_EVIDENCE.md`); estos candidatos específicos de HERMES/ARCA/AURA/CUSTOS siguen vigentes tal cual se describen abajo, pendientes de una pasada dedicada a esos módulos.

## Puentes sin ningún importador (dead code)

### NEXUS (4 archivos — el módulo destino ni siquiera existe) — **ELIMINADOS EN PROMPT 20**
- ~~`src/modules/fenix/fenixNexusBridge.ts`~~ — `convertNexusDataToFenixResourceInputs`
- ~~`src/modules/aura/auraNexusBridge.ts`~~ — `prepareAuraMedicalNeedsForNexus`
- ~~`src/modules/arca/arcaNexusBridge.ts`~~ — `prepareArcaNeedsForNexus`
- ~~`src/modules/hermes/hermesNexusBridge.ts`~~ — `prepareHermesLogisticsRoutes`

Verificado en el Prompt 18 por `tests/p0/nexus-stabilization.test.ts` (escaneo de código fuente: ninguna de las 4 exportaciones aparecía referenciada fuera de su propio archivo); re-verificado en el Prompt 20 antes de eliminar.

### CUSTOS (7 archivos)
- `src/modules/custos/custosArcaBridge.ts` — `convertArcaShelterCheckinsToCustosStatus`
- `src/modules/custos/custosAtlasBridge.ts` — `getCustosAtlasSummary`
- `src/modules/custos/custosAuraBridge.ts` — `convertAuraMedicalTransferToCustosStatus`
- `src/modules/custos/custosHermesBridge.ts` — `prepareCustosOperationalRouteRequest`
- `src/modules/custos/custosOraculoBridge.ts` — `convertOraculoEvidenceToCustosContext`
- `src/modules/custos/custosTalosBridge.ts` — `convertTalosRiskToCustosOperationalContext`
- `src/modules/custos/custosVigiaBridge.ts` — `convertVigiaMissingPersonContextToCustosSignal`

### Entre ARCA / HERMES / AURA (9 archivos)
- `src/modules/arca/arcaHermesBridge.ts` — `prepareArcaSheltersForHermes`, `toHermesShelterInputs`, `getBestSheltersForHermesRouting` (el dashboard llama `calculateHermesRoutes` directo, sin pasar por este puente)
- `src/modules/hermes/hermesArcaBridge.ts` — `prepareHermesRoutesToShelters`
- `src/modules/arca/arcaAuraBridge.ts` — `prepareArcaMedicalShelterSignals`
- `src/modules/arca/arcaFenixBridge.ts` — `prepareArcaSheltersForFenixSimulation`
- `src/modules/arca/arcaOraculoBridge.ts` — `convertOraculoEvidenceToArcaShelterEvidence`
- `src/modules/arca/arcaTalosBridge.ts` — `convertTalosAssessmentsToArcaDemandSignals`
- `src/modules/hermes/hermesAuraBridge.ts` — `prepareHermesRoutesToMedicalPoints`
- `src/modules/hermes/hermesFenixBridge.ts` — `prepareHermesRoutesForFenixScenario`
- `src/modules/hermes/hermesOraculoBridge.ts` — `convertOraculoEvidenceToHermesSignals`
- `src/modules/aura/auraArcaBridge.ts`, `auraFenixBridge.ts`, `auraHermesBridge.ts`, `auraOraculoBridge.ts`, `auraTalosBridge.ts`, `auraVigiaBridge.ts` — puentes de preparación sin consumidor

## Funciones muertas (definidas, nunca invocadas)

- `src/modules/custos/custosRiskFlags.ts` — `detectCustosSuspiciousQuery` — no se llama desde `custosSearch.ts` ni desde `CustosDashboard.tsx`, pese a que `CustosRiskFlag` (el tipo que produciría) sí se usa en otros lugares del módulo.
- `src/modules/custos/custosHumanitarianStatus.ts` — `deriveCustosHumanitarianStatus` — mismo caso.

## Rutas/endpoints huérfanos

- `src/app/api/medical-aid/route.ts` y `src/app/api/medical-points/route.ts` — existen, devuelven `source: "demo"` explícitamente, pero ningún componente de AURA los llama (`AuraDashboard.tsx`, `AuraMedicalPanel.tsx` y el resto de `src/components/aura/`/`src/components/medical/` no hacen `fetch` a ninguna de las dos rutas). Candidatos a conectar (si AURA avanza a `operational`) o a eliminar si no se usan.

## Archivos ya marcados `@deprecated` por el propio código (sin acción nueva aquí)

- `src/lib/medical/medicalDistance.ts`
- `src/data/medicalPoints.ts`
- `src/components/medical/MedicalPointsList.tsx`

## Modelo de acceso paralelo sin uso

- `src/lib/access/accessPolicy.ts` — superficie `AURA_PRO` (`minimumLayer: "INSTITUTIONAL_COMMAND"`) y `src/lib/security/rbac.ts` `canUseAuraPro` — definen un modelo de acceso institucional para AURA que **nunca se cruza** con `src/modules/aura/auraAccess.ts` (el que realmente gatea el dashboard). Solo referenciado por `src/app/api/access/request/route.ts` (intake de solicitudes) y `src/types/accessControl.ts`. Riesgo de confusión, no de seguridad (no baja el umbral de nada), pero dos modelos de acceso para el mismo módulo es un candidato claro a unificar o eliminar en el Prompt 20.

## Integración real pero dormida (no es "legacy", es una vía de mejora)

- `src/lib/criticalPoi/criticalPoiModuleQueries.ts` (Prisma real, tageado `moduleUse: ["AURA", ...]`) y `src/lib/aura/osmMedicalContext.ts` (adaptador OSM real) — no están conectados a ningún componente de AURA. No son candidatos a eliminar; son la ruta más directa para que AURA deje de depender de `auraDemoMedicalPoints`. Se anota aquí solo para que el Prompt 20 no los confunda con el resto de código muerto.
