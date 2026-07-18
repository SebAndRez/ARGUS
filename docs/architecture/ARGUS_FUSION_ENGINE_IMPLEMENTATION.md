# ARGUS — Implementación del ARGUS Fusion Engine (Fase C + correlación cross-amenaza)

**Fecha**: 2026-07-17
**Tipo**: implementación técnica.
**Mandato de origen**: "PROMPT — REARQUITECTURA DEL NÚCLEO DE ARGUS (NO MÁS AGREGADORES, SÍ UN SISTEMA OPERATIVO DE INCIDENTES)".
**Documentos hermanos**: `ARGUS_CANONICAL_INCIDENT_DESIGN.md`, `ARGUS_INCIDENT_MIGRATION_PLAN.md` (el diseño/plan de fases que esta entrega ejecuta parcialmente), `ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md` y `ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md` (Fases A/B, ya implementadas antes de esta tarea).

---

## 1. Auditoría completa del flujo actual

Se auditó el pipeline completo con tres agentes de exploración en paralelo (ingesta/persistencia, módulos/fuentes Chile, esquema/dedup/alertas/observabilidad) más lectura directa de `globalWatchEngine.ts` y `schema.prisma`. Hallazgo principal: **este repositorio ya contenía un diseño y una migración incremental hacia una arquitectura de incidentes** (`docs/architecture/ARGUS_CANONICAL_INCIDENT_DESIGN.md`, fechado 2026-07-14, actualizado 2026-07-17 el mismo día de esta tarea), con las Fases A (mapeador único `KnowledgeIncident→ArgusEvent`) y B (capa de lectura canónica) ya implementadas detrás de flags. La Fase C (persistencia canónica: lifecycle/severidad/confianza tipados, `IncidentTransition`, `IncidentRelation`) **no estaba implementada** — es exactamente el "núcleo de fusión" que pide el mandato.

**Pipeline real por corrida de Global Watch** (`src/lib/vigia/globalWatchEngine.ts`, cron cada 15 min vía GitHub Actions — Vercel Hobby solo permite cron diario):

```
Fuente (USGS/GDACS/FIRMS/EONET/EFFIS/EMS/ReliefWeb/SENAPRED)
  → runSourceFetch() por fuente (paralelo, con lock/timeout/backoff por fuente)
  → evaluateIncidentPromotion() (clasificación de amenaza + score)
  → mergeCorroboratingEvents() / correlateWildfireEvents() (misma amenaza, varias fuentes)
  → upsertKnowledgeIncidentByExternalId() + saveKnowledgeEvidenceIfNew() (persistencia)
  → sweepIncidentLifecycles() (new→active→monitoring→contained→resolved→archived)
  → [NUEVO] runMasterIncidentCorrelation() — correlación cross-amenaza (§4)
  → /api/vigia/events, /api/chile-alerts, /api/notifications (proyección/alertas)
```

## 2. Diagnóstico de puntos de falla (verificado en código, no supuesto)

| Punto | Hallazgo | Estado |
|---|---|---|
| `run-global-watch` devuelve HTTP 200 con fallo total | `summary.status === "failed"` no cambiaba el código de respuesta; el workflow de GitHub Actions solo trata no-2xx como fallo | **Corregido** (§6) |
| `run-chile-alerts` — mismo patrón | Idéntico bug, un archivo distinto | **Corregido** (§6) |
| 4 rutas `/api/ingest/*` no registran `IngestionRun` en sus ramas de error | `usgs-earthquakes`, `nasa-firms`, `gdacs-alerts`, `noaa-tsunami` — un fallo no deja ninguna fila, invisible para el panel de salud | **Corregido** (§6) |
| USGS se ingiere por dos pipelines independientes | `KnowledgeIncident` vía Global Watch + `ExternalEvent` vía `ingestUsgsEarthquakes.ts` (invocado en cada request de `/api/notifications`) | **No tocado** — es la Fase E del plan de migración existente, condicionada a que la Fase D esté validada; retirarlo ahora sería una "big bang" que el propio plan prohíbe |
| Correlación existente = solo "misma amenaza, varias fuentes" | `mergeCorroboratingEvents`/`wildfireCorrelationEngine.ts` nunca agrupan amenazas *distintas* relacionadas — exactamente el hueco del ejemplo del sistema frontal | **Corregido** (§4, ARGUS Fusion Engine) |
| Módulos 100% navegación manual, cero activación automática | `src/data/argusModules.ts` es el registro; ningún módulo se dispara desde la ingesta | **Corregido** (§5, module activation engine) |
| Dedup fragmentado en 5 implementaciones distintas | `deduplicateEvents.ts`, `dedup.ts` (Global Watch), `knowledgeDeduplication.ts`, `notificationCenterEngine.ts`, `shelterStatusDeduplication.ts` | **No tocado** — consolidar las 5 es un cambio de alto riesgo fuera de alcance de esta tarea; se documenta como backlog (§7) |
| Chile: CSN/SHOA/SERNAGEOMIN/DGA/MOP/CONAF sin adaptador | Registrados en `countrySourcePacks/chile.ts` con `status: "requires_parser"`, cero código | **No tocado** — cada uno requiere ingeniería inversa de un sitio gubernamental sin API pública (como ya se hizo para SENAPRED contra AppSync/Cognito); no se puede hacer "a ciegas" en esta tarea |
| Cortes eléctricos | No existe ninguna fuente/tabla/adaptador en todo el repo | **No tocado** — no hay nada que conectar todavía |
| Panel de observabilidad no mostraba descartados/duplicados por fuente | El dato ya existía en `KnowledgeIngestionRun.recordsSkipped`, solo no se renderizaba | **Corregido** (§6/7) |

## 3. Diseño de la nueva arquitectura

Se decidió **ejecutar la Fase C del plan ya existente** (`ARGUS_INCIDENT_MIGRATION_PLAN.md`) en vez de diseñar un "Fusion Engine" nuevo desde cero — construir uno paralelo habría duplicado exactamente el trabajo de diseño que ya vive en `ARGUS_CANONICAL_INCIDENT_DESIGN.md` y violado el mandato explícito de no crear sistemas paralelos. La Fase C **es** el núcleo de fusión que pide el mandato: identidad canónica, deduplicación formalizada, relaciones entre incidentes, lifecycle gobernado.

Se añadieron dos piezas que el plan existente **no cubre** y que el mandato sí pide explícitamente:
1. **Correlación cross-amenaza** ("incidente maestro") — el plan existente solo diseña identidad/lifecycle/severidad de un incidente individual; agrupar incidentes de dominios *distintos* relacionados es nuevo.
2. **Activación automática de módulos** — no existía absolutamente nada de esto (confirmado por auditoría: cero hits en todo `src/` para trigger/activate/autoTrigger entre módulos).

## 4. Implementación del ARGUS Fusion Engine (Fase C + correlación cross-amenaza)

### 4.1 Persistencia canónica (Fase C)

`prisma/schema.prisma` — columnas nuevas, **aditivas y nullable**, en `KnowledgeIncident` (nunca se tocó una columna existente): `status`, `effectiveSeverity`, `confidenceLevel`, `verificationStatus`, `scope`, `startedAt`, `confirmedAt`, `resolvedAt`, `archivedAt`, `sourceCount`, `evidenceCount`, `isOfficial`, `canonicalKey`. Dos tablas nuevas: `IncidentRelation` (relaciones no-fusionantes entre incidentes — `duplicate_of/caused_by/related_to/escalates/child_of/triggered_by/affects/supersedes`, vocabulario ya definido en `src/types/canonicalIncident.ts` de la Fase A) e `IncidentTransition` (auditoría de cambios de lifecycle/severidad, calcada del patrón ya probado de `RiskAssessmentRevision`).

Justificación técnica: se decidió persistir el vocabulario de lifecycle YA EXISTENTE (`new/active/monitoring/contained/resolved/archived`, calculado por `sweepIncidentLifecycles`) como columna tipada, en vez de migrar de una vez al enum de 11 estados que el diseño conceptual describe (`DETECTED/VALIDATING/CONFIRMED/.../REJECTED/DUPLICATE`) — ese enum de 11 estados requeriría una máquina de estados nueva (transiciones `VALIDATING→CONFIRMED`, etc.) que nadie calcula todavía en el repo. Formalizar lo que ya existe primero, y ampliar el vocabulario después, es la secuencia de menor riesgo (mismo principio de fases pequeñas y reversibles del plan de migración).

- `src/lib/incidents/canonicalFieldsSync.ts` (nuevo): `computeCanonicalFields()` — deriva las columnas nuevas reutilizando literalmente lo que las Fases A/B ya construyeron (`canonicalKnowledgeIncidentToArgusEvent` para severidad/proyección, `confidenceScoreToLevel` de `src/types/canonicalIncident.ts` para el nivel de confianza, `resolveIncidentSource().isOfficial` para oficialidad, `buildGlobalDedupKey`/`classifyGlobalThreat` para la clave canónica). No reimplementa ninguna clasificación.
- `src/lib/knowledge-intake/persistence/knowledgePersistenceService.ts` (modificado): `incidentCreateData()` y `upsertKnowledgeIncidentByExternalId()` ahora pueblan las columnas nuevas en cada alta/actualización, y escriben una fila `IncidentTransition` cuando `status`/`effectiveSeverity` cambian entre la versión previa y la nueva. Como `chileAlertPromotionEngine.ts` ya reutiliza esta misma función de upsert (confirmado en el código, no se tocó ese archivo), el dual-write cubre Global Watch **y** SENAPRED con un solo cambio.
- `scripts/backfillCanonicalIncidentFields.ts` (nuevo): backfill idempotente para filas ya persistidas antes de esta migración, reutilizando la misma `computeCanonicalFields()` (nunca diverge de la lógica de escritura en vivo). Dry-run por defecto, requiere `--apply` para escribir, nunca sobreescribe una columna ya poblada. `npm run backfill:canonical-fields`.

### 4.2 Correlación cross-amenaza — "incidente maestro"

`src/lib/incidents/masterIncidentEngine.ts` + `src/lib/incidents/masterIncidentRules.ts` (nuevos), invocado como paso 7 nuevo al final de `runGlobalWatch()` (después del sweep de lifecycle existente).

Regla `severe_weather_system`: si existe un `KnowledgeIncident` en un dominio de mal tiempo (`storm`, `flood`, `severe_wind`, `tornado`, etc.) con severidad alta+, se buscan otros incidentes de **dominios distintos** en la misma región/país dentro de una ventana de 72h → se crea (o reutiliza, por `externalId` estable `${rule.id}:${anchor.id}`) un `KnowledgeIncident` padre sintético (`domain: "multi_hazard_event"`, fuente `argus_fusion_engine`), y cada hijo se enlaza vía `IncidentRelation(kind: "child_of")` — **nunca se fusionan las filas**, cada hijo conserva su severidad/evidencia/lifecycle propios, exactamente como especifica `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §7.3.

Idempotencia: el `externalId` del padre está atado al `id` estable del incidente ancla, así que las corridas de 15 min sucesivas mientras el evento sigue activo reutilizan el mismo padre (upsert) en vez de crear uno nuevo cada vez, y las relaciones ya creadas no se duplican.

**Alcance explícitamente NO cubierto en esta entrega** (documentado, no un descuido):
- Albergues (Código Azul, `CriticalPoi`/`CriticalPoiOperationalStatus`) no se enlazan como `IncidentRelation` real — es una tabla con identidad/lifecycle propios sin severidad/confianza comparable a `KnowledgeIncident` todavía. Se enriquece el **resumen del padre** con un conteo de albergues activos en la misma región (`linkShelterContext()`, lectura, no relación persistida). Formalizarlo como relación real queda en el backlog (§7).
- Cortes eléctricos: no hay ninguna fuente que produzca este tipo de incidente — no hay nada que correlacionar.

### 4.3 Activación automática de módulos

`src/lib/modules/moduleActivationEngine.ts` + `src/data/moduleActivationRules.ts` (nuevos). `computeRecommendedModules()` es una función pura: clasifica el dominio del incidente por la misma taxonomía de amenaza ya usada para dedup/lifecycle (`classifyGlobalThreat`), y devuelve los slugs de `src/data/argusModules.ts` (registro existente, no se creó uno paralelo) relevantes según una tabla de reglas declarativa (ej. incendio alto+ → FÉNIX/HERMES/ARCA; sismo alto+ → +AURA; disturbio civil → CUSTOS/ORACULO).

Decisión de diseño explícita: los módulos son páginas de navegación manual (confirmado por auditoría — cero mecanismo de "abrir una página sin que el usuario haga clic" en todo el repo, y no se debía inventar uno, sería forzar UI sin acción del usuario). "Activación automática" se implementó como **recomendación calculada automáticamente**, expuesta en `ArgusEvent.recommendedModules` (campo nuevo, opcional, en `src/types/argusEvent.ts`) vía `/api/vigia/events`, y registrada en `AuditLog` (tabla reutilizada, no una tabla nueva) solo cuando el conjunto recomendado cambia — evita spam de una fila idéntica cada 15 min mientras el incidente sigue activo.

Para el incidente maestro, la recomendación es la **unión** de lo que cada hijo recomendaría individualmente (clasificado por su propia amenaza) más el bono transversal ATLAS/VESTA de "padre multi-amenaza" — evaluar el dominio sintético del padre aislado (`multi_hazard_event`) no clasifica ninguna amenaza conocida y perdería HERMES/ARCA de los hijos; este bug se detectó y corrigió durante la prueba de aceptación del sistema frontal (§8).

## 5. Correcciones realizadas (bugs confirmados en la auditoría)

1. **`src/app/api/jobs/run-global-watch/route.ts`** — devuelve HTTP 502 (no 200) cuando `summary.status === "failed"`, para que el workflow de GitHub Actions detecte el fallo total.
2. **`src/app/api/jobs/run-chile-alerts/route.ts`** — mismo bug, mismo arreglo.
3. **`src/lib/ingestion/ingestUsgsEarthquakes.ts`**, **`src/app/api/ingest/nasa-firms/route.ts`**, **`src/app/api/ingest/gdacs-alerts/route.ts`**, **`src/app/api/ingest/noaa-tsunami/route.ts`** — cada rama de error ahora llama `recordIngestionRun(sourceId, "error", ...)`, replicando el patrón ya correcto de `reliefweb-reports/route.ts`. Antes, un fallo de estas 4 fuentes no dejaba ninguna fila en `IngestionRun`, invisible para el panel de salud.

## 6. Panel de observabilidad — extendido, no reemplazado

`/admin/operations` (`OperationsPanel.tsx` + `/api/operations/health` + `operationsSnapshot.ts`) ya existía (contrario a la hipótesis de "no existe ningún panel" del mandato) — se extendió con tres piezas que la auditoría confirmó ausentes:
- Tabla "Ingesta por fuente": obtenidos/nuevos/actualizados/**descartados** por fuente (dato ya en `KnowledgeIngestionRun`, solo no se mostraba).
- "Incidentes maestros activos": conteo de padres `multi_hazard_event` no resueltos/archivados + total de relaciones `child_of`.
- "Activaciones de módulo (24h)": conteo + lista reciente, leído de `AuditLog`.

## 7. Archivos nuevos y modificados

**Nuevos**: `src/lib/incidents/canonicalFieldsSync.ts`, `src/lib/incidents/masterIncidentEngine.ts`, `src/lib/incidents/masterIncidentRules.ts`, `src/lib/modules/moduleActivationEngine.ts`, `src/data/moduleActivationRules.ts`, `src/data/chileFrontalSystemFixture.ts`, `scripts/backfillCanonicalIncidentFields.ts`, `tests/incidents/masterIncidentEngine.test.ts`, `tests/incidents/chileFrontalSystemAcceptance.test.ts`, `tests/modules/moduleActivationEngine.test.ts`.

**Modificados**: `prisma/schema.prisma`, `src/lib/knowledge-intake/persistence/knowledgePersistenceService.ts`, `src/lib/vigia/globalWatchEngine.ts` (paso 7 nuevo), `src/app/api/jobs/run-global-watch/route.ts`, `src/app/api/jobs/run-chile-alerts/route.ts`, `src/app/api/ingest/{usgs-earthquakes→ingestUsgsEarthquakes.ts,nasa-firms,gdacs-alerts,noaa-tsunami}`, `src/app/admin/operations/OperationsPanel.tsx`, `src/lib/observability/operationsSnapshot.ts`, `src/types/operationalHealth.ts`, `src/types/argusEvent.ts` (campo `recommendedModules` opcional), `src/app/api/vigia/events/route.ts` (enriquecimiento de respuesta + inclusión de la fuente sintética del Fusion Engine), `package.json` (script `backfill:canonical-fields`). Más 5 archivos de test existentes actualizados para mockear las nuevas llamadas a Prisma (`tests/mappers/canonicalMapperEndpoints.test.ts`, `tests/observability/operationsSnapshot.test.ts`, `tests/senapred/senapredSingleOwner.test.ts`, `tests/vigia/sourceScheduling.integration.test.ts`, `tests/vigia/wildfireCorrelationEngine.integration.test.ts`).

Ningún archivo/tabla existente fue eliminado. Ninguna migración destructiva.

## 8. Resultado de la prueba con el sistema frontal de Chile

Fixture: `src/data/chileFrontalSystemFixture.ts` — alerta SENAPRED de sistema frontal severo (Región de Valparaíso, severidad alta) + inundación (ReliefWeb) + daño a infraestructura (GDACS), mismos región/ventana temporal, dominios distintos — exactamente el escenario del mandato. Prueba: `tests/incidents/chileFrontalSystemAcceptance.test.ts` (4 casos, todos verdes).

**Qué detectó ARGUS (con el Fusion Engine)**: las 3 filas se agrupan en 1 incidente maestro (`multi_hazard_event`) con 3 `IncidentRelation(child_of)`; el resumen generado lista las 3 sub-alertas y sus fuentes; se detectó 1 albergue Código Azul activo en la misma región y se enlazó como contexto; se recomendaron los módulos `hermes`, `arca` (por la inundación/daño a infraestructura), `atlas`, `vesta` (por ser incidente padre multi-amenaza).

**Qué NO detectó (y por qué, confirmado por auditoría, no supuesto)**:
- Ninguna confirmación sismológica/tsunami/volcánica propia de Chile (CSN/SHOA/SERNAGEOMIN) — cero adaptador implementado para estas tres instituciones.
- Nivel de ríos (DGA) y cortes de ruta (MOP) — mismo motivo.
- Incendios asociados (CONAF) — mismo motivo (aunque wildfire vía FIRMS/EFFIS globales sí funciona, CONAF específicamente no).
- Cortes eléctricos — no existe absolutamente ninguna fuente para esto en el repositorio.
- MeteoChile/DMC como confirmación independiente — solo se extrae como mención de texto dentro de la alerta SENAPRED, nunca un feed propio.

**Qué llegó tarde o quedó como hallazgo del propio proceso de esta tarea**: la primera versión de la recomendación de módulos para el incidente padre solo evaluaba el dominio sintético `multi_hazard_event` (clasifica como amenaza `UNKNOWN`) y perdía HERMES/ARCA — detectado por la prueba de aceptación misma, corregido en `masterIncidentEngine.ts` para evaluar la unión de las amenazas de cada hijo (§4.3). Este es exactamente el tipo de fallo silencioso ("el módulo se activa parcialmente y nadie lo nota") que el panel de observabilidad (§6) y las pruebas automatizadas (no una corrida manual única) están para atrapar.

## 9. Recomendaciones para la siguiente etapa

En orden de valor/riesgo, siguiendo la fase D del plan de migración ya existente:

1. **Conectar consumidores a las columnas canónicas** (Fase D del plan): mapa/notificaciones ya leen lo mismo hoy; ATLAS/VIGÍA/ORÁCULO/TALOS siguen leyendo sus propias fuentes estáticas/demo en paralelo al gateway canónico — conectarlos de a uno, con flag individual, es el siguiente paso de menor riesgo.
2. **Formalizar `IncidentRelation` real entre incidente y albergue** una vez que `CriticalPoiOperationalStatus` tenga un campo de severidad/confianza comparable — hoy es deliberadamente solo contexto de lectura (§4.2).
3. **Consolidar las 5 implementaciones de deduplicación** en una sola, ahora que `canonicalKey` persiste (Fase C) — es el trabajo de mayor apalancamiento pendiente, pero requiere su propio plan de fases por el riesgo de tocar comportamiento en producción.
4. **Retirar el pipeline dual de USGS** (`ExternalEvent`) solo después de que la Fase D punto 1 (mapa/notificaciones migrados a columnas canónicas) esté estable en producción por al menos un ciclo de observación — no antes, por el principio de reversibilidad del plan existente.
5. **Fuentes chilenas nuevas (CSN/SHOA/SERNAGEOMIN/DGA/MOP/CONAF, cortes eléctricos)**: cada una requiere investigación dedicada de su sitio/API real (como se hizo para SENAPRED contra AppSync/Cognito) — se recomienda una tarea separada por institución, no un intento genérico, dado que ya existe un precedente de cuánto esfuerzo de ingeniería inversa tomó SENAPRED y el riesgo de que la infraestructura cambie sin aviso.
6. **Ampliar el lifecycle a los 11 estados del diseño conceptual** (`VALIDATING/CONFIRMED/ESCALATING/REJECTED/DUPLICATE`) una vez que el vocabulario de 6 estados actual esté validado en producción con datos reales durante al menos un ciclo de observación.

## 10. Verificación

- `npx tsc --noEmit` — limpio (único error preexistente y no relacionado: `tests/senapred/senapredSingleOwner.test.ts:52`, un objeto con `id` duplicado en un test ya existente antes de esta tarea).
- `npx vitest run` — 1204/1204 tests pasan. Dos archivos de test fallan en la recolección (`tests/p0/codigo-azul-{dedup,pagination}.test.ts`) por un bug de hoisting de `vi.mock` preexistente, confirmado independiente de esta tarea (reproducido idéntico en un `git stash` limpio antes de cualquier cambio de esta sesión).
- La migración de Prisma (`prisma migrate dev/deploy`) **no se ejecutó** en esta tarea — toca la base de datos Supabase compartida (no hay una base local separada, según la memoria del proyecto), y requiere confirmación explícita del entorno objetivo antes de aplicarse.
