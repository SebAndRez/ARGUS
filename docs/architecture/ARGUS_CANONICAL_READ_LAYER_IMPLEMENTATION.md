# ARGUS — Vocabulario de dominio + capa canónica de lectura (Fase A restante + Fase B)

**Fecha**: 2026-07-17
**Tipo**: implementación técnica — completa el punto 3 del programa de evolución de ARGUS ("implementación del modelo canónico de incidente").
**Alcance**: no se modificó `prisma/schema.prisma`, no se crearon migraciones, no se ejecutó ninguna migración, no se movieron datos, no se hizo commit ni push, no se cambió el changelog ni la versión pública.
**Documentos que preceden y gobiernan esta implementación**: `ARGUS_CANONICAL_INCIDENT_DESIGN.md`, `ARGUS_INCIDENT_MIGRATION_PLAN.md`, `ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md` (Fase A, mapeador único — ya implementada), `ARGUS_SENAPRED_CANONICAL_INGESTION.md` (single owner SENAPRED — ya implementado).

---

## 1. Punto de partida verificado

Antes de tocar código se releyeron los cuatro documentos de arquitectura y se releyó el `prisma/schema.prisma` real. Confirmado:

- El mapeador canónico único `canonicalKnowledgeIncidentToArgusEvent()` ya existe y ya es consumido por `/api/vigia/events` y `/api/chile-alerts` (Fase A, punto 3 del plan — completo).
- SENAPRED ya tiene un único owner de ingestión (`promoteChileOfficialAlerts`) verificado por `tests/senapred/senapredSingleOwner.test.ts`.
- `prisma/schema.prisma` **no tiene ninguna columna/tabla canónica todavía**: no existe `canonicalKey`, `Incident.status` tipado, `IncidentTransition`, `IncidentRelation`, ni `incidentId` en `Report`/`HelpRequest`. Fase C del plan de migración sigue sin empezar.
- Del punto 4 de la Fase A del plan ("consolidar los tres registros de fuente"), una inspección de código confirmó que en realidad existen **cuatro** registros de fuente con propósitos distintos, no tres — ver §3.
- La Fase A puntos 1, 2 y 4 (tipos de dominio puros, enums canónicos, consolidación de fuentes) seguían **sin implementar**, tal como documentaba explícitamente `ARGUS_INCIDENT_MIGRATION_PLAN.md` línea 31. Esta tarea los completa.
- La Fase B ("capa canónica de lectura") seguía completamente sin empezar.

Esta tarea implementa: Fase A puntos 1, 2, 4 (restantes) + Fase B completa. No toca Fase C (persistencia) — ver §7 para la justificación explícita de por qué se excluyó deliberadamente de esta entrega.

---

## 2. Vocabulario de dominio (Fase A, puntos 1-2)

Nuevo módulo puro `src/types/canonicalIncident.ts`, sin importar Prisma ni ningún endpoint:

| Tipo/función | Contenido |
|---|---|
| `CanonicalIncidentLifecycle` | 11 estados del diseño §8.1 (`DETECTED…DUPLICATE`) |
| `CanonicalSeverityLevel` | Alias literal de `ArgusSeverity` — **no** introduce una sexta escala (decisión explícita del diseño §9, verificada contra el DTO real) |
| `CanonicalConfidenceLevel` | 4 niveles (`LOW/MEDIUM/HIGH/VERY_HIGH`), función pura `confidenceScoreToLevel()` que clasifica el mismo `confidenceScore` 0-100 ya producido por `evidenceScoring.ts`/`alertPromotionEngine.ts` — no recalcula ningún score nuevo |
| `CanonicalVerificationStatus` | 5 estados del diseño §10.2 |
| `CanonicalIncidentRelationKind` | 8 tipos de relación del diseño §5.5 |
| `CanonicalIncidentSource`, `CanonicalIncidentEvidence`, `CanonicalIncidentTransition`, `CanonicalIncidentRelation`, `CanonicalIncidentAssessment`, `CanonicalIncident` | Interfaces de dominio del diseño §5.1-§5.8, sin persistencia — el contrato que una futura Fase C debe satisfacer |

Ningún tipo de este módulo se usa hoy para escribir en base de datos — son solo el vocabulario que la Fase B (capa de lectura) y una futura Fase C (persistencia) comparten.

---

## 3. Consolidación de fuentes (Fase A, punto 4)

**Hallazgo que corrige al diseño original**: existen **cuatro** "registros de fuente" en el repo, no tres:

| Registro | Propósito | ¿Produce `KnowledgeIncident`? |
|---|---|---|
| `src/lib/vigia/sourceRegistry.ts` (`VIGIA_SOURCE_REGISTRY`) | Fuentes que Global Watch consulta para crear incidentes | **Sí — la única relevante al modelo canónico** |
| `src/lib/knowledge-intake/sourceRegistry.ts` | Catálogo estático de ~65 fuentes de base de conocimiento histórico | No |
| `src/lib/sources/sourceRegistry.ts` (`ARGUS_SOURCE_REGISTRY`) | Vista de salud/confiabilidad para el panel admin | No |
| `src/lib/sources/countrySourceRegistry.ts` | Packs de configuración de ingesta por país | No |

Fusionar los cuatro en una sola tabla sería alto riesgo (15+ consumidores en 2-4) sin ningún beneficio para el modelo de incidente, porque solo el primero participa en la producción de `KnowledgeIncident`/`ArgusEvent`. Se aplicó la regla del mandato ("busca el equivalente existente, determina si puede ampliarse") de forma literal: se consolidó únicamente el registro que sí importa para el incidente canónico.

**Trabajo realizado**: nuevo módulo `src/lib/canonical/incidentSourceRegistry.ts`:
- `resolveArgusSourceType(sourceId)` — reemplaza la función local `sourceTypeFor` que antes vivía **duplicada** dentro de `canonicalKnowledgeIncidentToArgusEvent.ts` (mismo comportamiento exacto, verificado por los 127 tests preexistentes del mapeador, que siguen pasando sin modificar).
- `resolveIncidentSource(sourceId, sourceName?)` — devuelve un `CanonicalIncidentSource` completo, usado por la Fase B.

`canonicalKnowledgeIncidentToArgusEvent.ts` fue modificado para delegar en `resolveArgusSourceType` en vez de mantener su propia copia de la lógica de lookup — cero duplicación de lógica de fuentes, cero cambio de comportamiento (los 127 tests existentes de ese módulo pasan sin modificar ninguna aserción).

---

## 4. Capa canónica de lectura (Fase B)

Nuevo módulo `src/lib/canonical/canonicalReadLayer.ts`, función `buildCanonicalIncidentPreview()`:

1. Lee `KnowledgeIncident` (todas las fuentes, no solo Global Watch) dentro de la ventana solicitada.
2. Proyecta cada fila con el mapeador canónico único de la Fase A (`canonicalKnowledgeIncidentToArgusEvent`) — cero lógica de mapeo duplicada.
3. Filtra por vigencia operacional reutilizando `isIncidentOperationallyActive()` (Prompt 10, `operationalVisibilityPolicy.ts`) — mismo criterio que ya usan `/api/vigia/events` y `/api/chile-alerts`, no una tercera política de vigencia.
4. Lee `Report` y `HelpRequest` dentro de la misma ventana y los correlaciona espacio-temporalmente contra los incidentes proyectados: proximidad ≤500m + ventana ≤6h (diseño §7.2, regla explícita para reportes ciudadanos), tomando el incidente más cercano que califique.
5. Nunca persiste nada. Un match se reporta como "señal ciudadana correlacionada con el incidente X" — **no crea evidencia, no fusiona, no reescribe el incidente**. Una señal sin match se reporta como no correlacionada (candidata a un futuro `Incident(verificationStatus: UNVERIFIED)` en una Fase C, no materializada aquí).

**Privacidad (Prompt 2, `PRIV-FINAL-001`)**: el resultado de `Report`/`HelpRequest` se serializa con `toOperatorReport()`/`toOperatorHelpRequest()` (`src/lib/security/incidentDto.ts`) — los mismos DTOs que ya usa `/api/admin/reports` — en vez de una tercera forma de serialización o filas Prisma crudas. La correlación en sí usa las coordenadas exactas internamente (necesarias para el cálculo de distancia ≤500m), pero esas coordenadas exactas **nunca salen** de la función: la respuesta solo expone lo que el DTO de operador ya expone.

**Endpoint**: `GET /api/incidents-canonical-preview`, interno/no documentado públicamente, gateado a `OPERATOR+` (`requireOperator()`) y detrás del flag `CANONICAL_READ_LAYER_ENABLED` (por defecto deshabilitado → `404`, tal como especifica el plan de migración: "por defecto false hasta validar"). No reemplaza ningún endpoint existente.

**Primer flag runtime real del repo**: `CANONICAL_MAPPER_ENABLED` (Fase A) nunca se implementó como variable de entorno — la migración se hizo directa (ver `ARGUS_INCIDENT_MIGRATION_PLAN.md` línea 30). `CANONICAL_READ_LAYER_ENABLED` es, por tanto, el primer flag de esta familia efectivamente leído de `process.env`. Sigue el patrón ya establecido en el repo (lectura directa `process.env.X === "true"` en el call site, sin módulo central de flags — no existe ninguno hoy, ver inventario §8).

---

## 5. Deduplicación / correlación — utilidades nuevas, sin duplicar motores existentes

- `haversineKm(a, b)` — distancia genérica en km. `distanceKm()` de `src/lib/ingestion/correlateExternalEvents.ts` está acoplada al tipo `ArgusNormalizedEvent` (con su propio guard `hasCoordinates`) y no aplica a `Report`/`HelpRequest`/`ArgusEvent` sin forzar un adaptador — se optó por una función genérica de ~10 líneas en vez de forzar tipos incompatibles a través de un motor de correlación diseñado para otro dominio (USGS↔GDACS↔NOAA).
- `representativePoint(geometry)` — punto representativo de cualquier variante de `ArgusGeometry` para fines de proximidad; usa `anchor` para `administrative_area`/`region_reference`, nunca deriva un punto de un bbox (el tipo no tiene esa variante).

No se creó un segundo sistema de deduplicación de incidentes: la correlación de la Fase B es exclusivamente `Report`/`HelpRequest` → incidente existente, un caso que no tenía ninguna implementación previa (confirmado por inspección: cero código de correlación Report/HelpRequest↔KnowledgeIncident existía en el repo antes de esta tarea).

---

## 6. Archivos

**Nuevos**:
- `src/types/canonicalIncident.ts`
- `src/lib/canonical/incidentSourceRegistry.ts`
- `src/lib/canonical/canonicalReadLayer.ts`
- `src/app/api/incidents-canonical-preview/route.ts`
- `tests/canonical/incidentSourceRegistry.test.ts` (7 casos)
- `tests/canonical/canonicalReadLayer.test.ts` (9 casos)
- `docs/architecture/ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md` (este documento)

**Modificados**:
- `src/lib/canonical/canonicalKnowledgeIncidentToArgusEvent.ts` — `sourceTypeFor` delega en `resolveArgusSourceType`; import `ArgusSourceType` retirado (ya no se usa directamente).

Ningún otro archivo productivo fue tocado. `prisma/schema.prisma` no fue modificado (confirmado con `npx prisma validate`, sin diferencias).

---

## 7. Por qué esta entrega NO toca Prisma/Fase C

El mandato permite explícitamente preparar una migración "creada, no ejecutada en producción". Se decidió **no** preparar siquiera el diff de `schema.prisma` en esta entrega, por una razón operacional verificada, no solo de alcance:

> La memoria de este proyecto registra que la base de datos local de desarrollo **es la misma base Supabase compartida** que otros entornos usan — no hay una base de datos local aislada.

Bajo esa condición, "crear una migración localmente" y "aplicarla a producción" no son operaciones separadas con un paso de revisión intermedio seguro — son, de hecho, la misma base. El propio mandato exige explícitamente ("no asumas que una migración aplicada localmente puede ejecutarse en producción sin revisión") un nivel de cautela que, dada esta arquitectura de entorno, solo se satisface **no ejecutando ningún comando `prisma migrate`** en esta sesión — ni siquiera `--create-only`, que en algunos flujos de Prisma puede requerir o tocar una shadow database.

Además, la Fase B recién implementada en esta misma entrega es, según el propio plan de migración, el prerrequisito de la Fase C ("Dependencias: Fase A y B completas y validadas — la lógica de clasificación/correlación ya debe estar probada en modo lectura antes de comprometerla a escritura"). Avanzar a Fase C en la misma sesión en que Fase B se acaba de escribir, sin ningún ciclo de observación real, violaría esa secuencia explícitamente diseñada.

El diseño completo de las columnas/tablas de Fase C (`canonicalKey`, `status` tipado, las 4 dimensiones de severidad, `verificationStatus`, `IncidentTransition`, `IncidentRelation`, `incidentId` en `Report`/`HelpRequest`) ya existe, completo y aprobado, en `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §5 y `ARGUS_INCIDENT_MIGRATION_PLAN.md` Fase C — no requiere rediseño, solo ejecución en una sesión dedicada con acceso a un entorno de base de datos verdaderamente aislado (o con aprobación explícita del propietario del proyecto para operar sobre la base compartida).

---

## 8. Riesgos pendientes / trabajo no incluido

- **Fase C completa** (persistencia real, columnas tipadas, `IncidentTransition`/`IncidentRelation`, `incidentId` en `Report`/`HelpRequest`) — sin empezar, ver §7.
- **Consolidación de los otros 3 registros de fuente** (`knowledge-intake/sourceRegistry.ts`, `sources/sourceRegistry.ts`, `sources/countrySourceRegistry.ts`) — deliberadamente fuera de alcance, no aportan al modelo de incidente (§3).
- **`argusCorrelationEngine.correlateSignals()`** (usado por `/api/argus/events`) — sigue sin pasar por el mapeador canónico, tal como ya documentaba la Fase A original; no se tocó en esta entrega.
- **Reglas de correlación por categoría de amenaza** (diseño §7.2, sismos/incendios/alertas oficiales/salud pública) — solo se implementó la regla de reportes ciudadanos (proximidad+ventana), que era la única sin ninguna implementación previa. Las demás categorías ya tienen su propia lógica formalizada (`dedup.ts`, `firmsClusterer.ts`, `chileAlertLifecycle()`) y no se tocaron, en línea con "no dupliques lógica de deduplicación".
- **La capa de lectura no valida contra tráfico real** todavía — el plan de migración pide comparar, en staging, esta vista contra `/api/events` + `/api/vigia/events` + `/api/notifications` combinados antes de considerar la Fase B "validada". Eso requiere un entorno con tráfico real, fuera del alcance de esta sesión.

---

## 9. Próximo bloque recomendado

Según `ARGUS_INCIDENT_MIGRATION_PLAN.md`, el siguiente paso natural — una vez que `CANONICAL_READ_LAYER_ENABLED` se observe en un entorno real durante un periodo razonable — es **Fase C: persistencia canónica**, en una sesión dedicada, con acceso confirmado a un entorno de base de datos aislado del compartido, siguiendo exactamente el diseño ya aprobado en `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §5 (migración aditiva, backfill idempotente con modo dry-run, doble escritura detrás de `CANONICAL_DUAL_WRITE_ENABLED`).
