# ARGUS — Plan de Migración Incremental hacia la Entidad Canónica de Incidente

**Fecha**: 2026-07-14
**Tipo**: plan de fases — **solo diseño, sin implementación en esta tarea**.
**Documento hermano de**: `ARGUS_CANONICAL_INCIDENT_DESIGN.md` (decisiones), `ARGUS_CANONICAL_INCIDENT_DIAGRAMS.md` (diagramas), `ARGUS_INCIDENT_FIELD_MAPPING.md` (matriz de campos).

Principio rector: **ninguna fase es un "big bang"**. Cada fase es individualmente reversible, no requiere que la siguiente esté planificada en detalle para empezar, y dos fases consecutivas nunca dependen de un despliegue simultáneo.

---

## 0. Resumen de fases

| Fase | Nombre | Toca esquema Prisma | Toca datos productivos | Reversible sin rollback de fase anterior |
|---|---|---|---|---|
| A | Contratos y adaptadores | No | No | Sí — son solo tipos TS y un mapeador nuevo detrás de flag |
| B | Capa canónica de lectura | No | No (solo lectura) | Sí — flag apaga la proyección unificada |
| C | Persistencia canónica | Sí | Sí (doble escritura) | Sí — se mantiene escritura legacy hasta validar |
| D | Conectar consumidores | No (usa lo de C) | No (solo cambia qué leen) | Sí, por consumidor — cada conexión tiene su propio flag |
| E | Retiro de legado | Sí (drops) | Sí (borrado de tablas huérfanas) | No — es la única fase intencionalmente irreversible, y por eso va última y requiere criterios de aceptación explícitos |

---

## 1. Fase A — Contratos y adaptadores

**Objetivo**: definir el vocabulario canónico sin tocar producción.

> **Estado de implementación (2026-07-14)**: el punto 3 de "Trabajo" (mapeador único) fue **implementado técnicamente** — ver `docs/architecture/ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md`. Alcance real de lo implementado, más acotado que lo aquí planificado:
> - Se creó `canonicalKnowledgeIncidentToArgusEvent()` en `src/lib/canonical/`, con un contrato de entrada explícito (`CanonicalKnowledgeIncidentInput`, no el `knowledgeIncidentToCanonical()` intermedio descrito arriba — se decidió que la fila Prisma ya satisface el contrato canónico estructuralmente, sin necesidad de un adaptador de traducción separado).
> - Unifica `vigiaIncidentToArgusEvent.ts` y `knowledgeIncidentToArgusEvent.ts` (ambos ahora wrappers deprecados de una línea). **No** incluye la construcción directa de `argusCorrelationEngine.correlateSignals()` (`/api/argus/events`) — ese endpoint no consume `KnowledgeIncident`, quedó fuera de alcance y sigue pendiente como se planificó originalmente.
> - `/api/vigia/events` y `/api/chile-alerts` se migraron directamente al mapeador canónico (sin flag `CANONICAL_MAPPER_ENABLED` — se optó por migración directa + wrappers legacy retenidos como red de seguridad, en vez de un flag en runtime, dado que el reconocimiento de consumidores no encontró ningún import fuera de esos dos endpoints).
> - Los puntos 1 (tipos `Incident`/`IncidentEvidence`/`IncidentSource`/`IncidentRelation`/`IncidentAssessment`/`IncidentTransition` como módulo de dominio propio), 2 (enums canónicos completos de lifecycle/severidad/confianza) y 4 (consolidación de los tres registros de fuente en un `IncidentSource` único) **siguen sin implementarse** — el mapeador reutiliza `src/lib/vigia/sourceRegistry.ts` tal como está, sin tocarlo.
>
> **Actualización (2026-07-17)**: los puntos 1, 2 y 4 fueron implementados — ver `docs/architecture/ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md`. Corrección al inventario original: no son tres registros de fuente sino **cuatro**; solo `src/lib/vigia/sourceRegistry.ts` produce `KnowledgeIncident`, así que la consolidación se limitó a ese, sin fusionar los otros tres (propósitos no relacionados con el incidente canónico). `sourceTypeFor` (antes duplicado dentro del mapeador) ahora delega en `src/lib/canonical/incidentSourceRegistry.ts`.
> - Validación: 32 tests nuevos (15 casos unitarios obligatorios + variantes, más pruebas de integración de los dos endpoints), sustituyendo el "snapshot test contra producción" aquí descrito por fixtures deterministas — no se ejecutó contra datos reales de producción en esta fase.

**Trabajo**:
1. Crear los tipos TS del modelo conceptual (`Incident`, `IncidentEvidence`, `IncidentSource`, `IncidentRelation`, `IncidentAssessment`, `IncidentTransition`) en un módulo nuevo, sin relación con Prisma todavía — son tipos de dominio puros.
2. Definir los enums canónicos: lifecycle (11 estados, §8 del diseño), severidad (4 dimensiones × 5 niveles), confianza (`confidenceLevel` 4 niveles + `verificationStatus` 5 estados).
3. Construir **un** mapeador `canonicalIncidentToArgusEvent()` que internamente todavía lee de `KnowledgeIncident` (vía un adaptador de traducción temporal `knowledgeIncidentToCanonical()`), pero que unifica la lógica hoy dividida entre `vigiaIncidentToArgusEvent.ts`, `knowledgeIncidentToArgusEvent.ts` y la construcción directa en `argusCorrelationEngine.correlateSignals()`.
4. Consolidar los tres registros de fuente hoy dispersos (`src/lib/vigia/sourceRegistry.ts`, `src/lib/knowledge-intake/sourceRegistry.ts`, tabla `KnowledgeSource`) en un único `IncidentSource` lógico — sin tocar la tabla `KnowledgeSource` todavía, solo la capa de tipos/lookup.

**Dependencias**: ninguna — puede empezar de inmediato.

**Feature flag**: `CANONICAL_MAPPER_ENABLED` — controla si `/api/vigia/events`, `/api/chile-alerts` y `/api/argus/events` usan el mapeador único o los tres legacy. Por defecto `false` hasta validar en el siguiente punto.

**Validación antes de avanzar**: snapshot test que compara, para una muestra de incidentes reales de producción (solo lectura), el output del mapeador único contra el output de los tres mapeadores legacy — deben coincidir salvo en los defectos ya documentados que el mapeador único corrige intencionalmente (p. ej. `confidence` hardcoded en el mapeador chileno).

**Rollback**: apagar el flag. Cero impacto — no se tocó ninguna tabla ni se escribió ningún dato nuevo.

**Riesgo**: bajo. El único riesgo es que el mapeador único introduzca una regresión visual en el mapa; mitigado por la validación de snapshot antes de habilitar el flag en producción.

---

## 1.5 Corrección operacional de lectura (Prompt 10) — completada, no es Fase B

> **Estado (2026-07-14)**: completada — ver `docs/architecture/ARGUS_OPERATIONAL_LIFECYCLE_POLICY.md`. Esta corrección es **complementaria** a la Fase A (usa el `ArgusEvent.status` ya producido por el mapeador canónico) y **no debe confundirse con la Fase B** de abajo (que sigue sin implementarse — no existe todavía una vista unificada `KnowledgeIncident + Report/HelpRequest`).
>
> Alcance real de lo implementado:
> - Política única de vigencia (`isIncidentOperationallyActive`/`classifyLifecycleVisibility`, `src/lib/lifecycle/operationalVisibilityPolicy.ts`), pura, con reloj inyectado, fail-closed para lifecycle no reconocido.
> - `/api/vigia/events` y `/api/chile-alerts` ya no muestran incidentes `resolved`/`archived`/`cancelled` como vigentes, y ya no truncan a `limit` antes de filtrar (bug de paginación corregido).
> - `/api/argus/events` aplica la misma política por defecto, preservando `?status=` explícito como consulta histórica intencional.
> - `/api/external-events` y `/api/notifications` filtran `ExternalEvent.expiresAt` directamente en Prisma (columna real, filtro portable).
> - `/api/notifications`: `summary.critical`/`summary.high` ya no cuentan incidentes con `status` terminal, corrigiendo el caso de un incidente crítico resuelto que seguía inflando el contador de alertas activas.
> - `/api/command/overview`: `totalActiveIncidents`/`priorityCounts`/`topIncidents` excluyen `CLOSED`/`DISMISSED`.
> - **No** se movió el lifecycle de `KnowledgeIncident` desde JSON hacia una columna tipada — sigue pendiente en su totalidad como parte de la Fase C de abajo. **No se marca resuelto el lifecycle persistente.**

---

## 2. Fase B — Capa canónica de lectura

> **Estado de implementación (2026-07-17)**: implementada — ver
> `docs/architecture/ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md`. Alcance
> real: `buildCanonicalIncidentPreview()` (`src/lib/canonical/canonicalReadLayer.ts`)
> combina `KnowledgeIncident` (vía el mapeador de Fase A) con `Report`/
> `HelpRequest` correlacionados en tiempo de lectura por proximidad (≤500m) +
> ventana (≤6h), expuesto en `GET /api/incidents-canonical-preview`
> (interno, `OPERATOR+`, detrás de `CANONICAL_READ_LAYER_ENABLED` — por
> defecto deshabilitado). **No** se validó todavía contra tráfico real de
> staging (punto 3 de "Trabajo" abajo) — eso requiere un entorno con tráfico
> real, fuera de alcance de una sesión de implementación.

**Objetivo**: producir una vista unificada de "todos los incidentes conocidos" sin escribir todavía en una tabla nueva.

**Trabajo**:
1. Construir una función de agregación en memoria/query-time que combine `KnowledgeIncident` (vía el mapeador de Fase A) con `Report`/`HelpRequest` correlacionados espacio-temporalmente (reglas de §7.2 del diseño, aplicadas en tiempo de lectura, no de escritura).
2. Exponer esta vista **detrás de un flag** en un endpoint nuevo de solo lectura (p. ej. `/api/incidents-canonical-preview`, interno/no documentado públicamente) — nunca reemplaza `/api/incidents` todavía.
3. Comparar, para tráfico real de staging, los resultados de esta vista contra `/api/events` + `/api/vigia/events` + `/api/notifications` combinados, registrando discrepancias (`classification_conflicts`, `source_disagreements` de §20 del diseño) sin actuar sobre ellas todavía.

**Dependencias**: Fase A completa (usa el mapeador único como una de sus fuentes).

**Feature flag**: `CANONICAL_READ_LAYER_ENABLED`.

**Rollback**: apagar el flag; el endpoint de preview deja de responder. No hay datos escritos que revertir.

**Riesgo**: bajo. El único riesgo es de carga (una vista agregada corre más queries por request) — mitigado con caché de corta duración, siguiendo el patrón ya usado (`sourceCache.ts`, TTL 60s-5min).

---

## 3. Fase C — Persistencia canónica

**Objetivo**: evolucionar `KnowledgeIncident` hacia `Incident` en el esquema real, con doble escritura temporal.

**Trabajo** (requiere migración Prisma — no se ejecuta en esta tarea, solo se planifica aquí):
1. Añadir a `KnowledgeIncident` las columnas nuevas identificadas en el diseño (§5.1): `canonicalKey`, `status` tipado, `sourceSeverity`/`normalizedSeverity`/`assessedSeverity`/`effectiveSeverity`, `verificationStatus`, `scope`, `startedAt`, `confirmedAt`, `resolvedAt`, `archivedAt`, `expiresAt`, `sourceCount`, `evidenceCount`, `isOfficial`. Todas nullable/con default al inicio — **aditivo, no destructivo**.
2. Backfill de las columnas nuevas a partir de los datos existentes (`technicalFactorsJson.lifecycle` → `status`; `severity` string → las 4 columnas nuevas con `normalizedSeverity = severity` como punto de partida; `reviewStatus` → `verificationStatus` con la tabla de mapeo del documento de campos).
3. Crear la tabla nueva `IncidentTransition` (calcada de `RiskAssessmentRevision`).
4. Crear la tabla nueva `IncidentRelation` (evolución de `ExternalEventCorrelation`, que queda deprecada pero no se borra todavía).
5. Añadir `externalId` a `KnowledgeEvidence` (hoy solo vive en el incidente padre) y migrar el valor existente de `KnowledgeIncident.externalId` a la evidencia primaria de cada incidente.
6. Añadir `incidentId String?` (nullable) a `Report` y `HelpRequest` — sin backfill automático inicial (se popula hacia adelante; backfill retroactivo es opcional y de bajo riesgo por ser nullable).
7. Habilitar doble escritura: todo código que hoy escribe en `KnowledgeIncident` (Global Watch, promoción SENAPRED) escribe también las columnas nuevas usando la lógica de clasificación/lifecycle unificada de Fase A.
8. Solo al final de la fase, y con aceptación explícita (§6), considerar el renombre físico `KnowledgeIncident → Incident` (opcional — Prisma permite mantener el nombre físico con `@@map` indefinidamente si el renombre se juzga de bajo valor frente a su riesgo).

**Dependencias**: Fase A y B completas y validadas (la lógica de clasificación/correlación ya debe estar probada en modo lectura antes de comprometerla a escritura).

**Feature flag**: `CANONICAL_DUAL_WRITE_ENABLED` (activa las escrituras nuevas), `CANONICAL_FIELDS_TRUSTED` (activa que las lecturas empiecen a preferir las columnas nuevas sobre las derivadas de JSON).

**Rollback**: desactivar `CANONICAL_DUAL_WRITE_ENABLED` — las columnas nuevas simplemente dejan de actualizarse, el sistema sigue funcionando exactamente como antes con las columnas antiguas. Como son aditivas, no hay necesidad de una migración `down` destructiva para revertir el comportamiento (aunque sí se documenta cómo revertir el esquema si fuera estrictamente necesario).

**Riesgo**: medio-alto — es la única fase con migración de esquema real. Mitigaciones: columnas nullable/aditivas (nunca se quita una columna existente en esta fase), backfill idempotente y repetible, doble escritura validada contra Fase B antes de confiar en las columnas nuevas.

---

## 4. Fase D — Conectar consumidores

**Objetivo**: migrar cada consumidor, uno a la vez, a leer desde las columnas canónicas.

**Orden** (según §19 del mandato, ya reflejado en el diseño §21 pregunta 10):

1. **Mapa 2D + Orbit 3D** — cambiar `/api/vigia/events`, `/api/chile-alerts`, `/api/argus/events` para usar el mapeador único de Fase A leyendo ya las columnas canónicas de Fase C. Menor riesgo relativo: ya comparten una sola fuente (`ArgusEvent`) hoy, según confirmó la auditoría — el cambio es de "cuál mapeador" no de "cuántas fuentes".
2. **Notificaciones** — cambiar `buildArgusNotifications` para que el trigger de `KnowledgeIncident`/`Incident` use las 6 transiciones formales de §15 del diseño en vez de la heurística de dedup por firma actual. Corrige directamente el hallazgo de fatiga de alertas.
3. **ATLAS** — conectar a `Incident` además de su fuente estática de conflicto (no reemplaza `ConflictZone`, la complementa).
4. **VIGÍA** — conectar el módulo (`src/modules/vigia`, hoy solo usa `/api/events` con fallback a demo fixtures) a leer también `Incident`, dado que es semánticamente el módulo más cercano al dominio de Global Watch.
5. **ORÁCULO** — igual patrón, priorizando verificación (`verificationStatus`) como su ángulo de valor.
6. **TALOS** — conectar `IncidentAssessment` real (reemplazando el cálculo client-side actual, `calculateTalosRiskAssessment`) a partir de `RiskAssessment` evolucionado con FK `incidentId`.
7. **Resto** (HERMES, ARCA, FÉNIX, CUSTOS) — en función de la disponibilidad de `IncidentAssessment`/`IncidentAction` de TALOS, dado que HERMES hoy depende de un snapshot demo de TALOS en vez de TALOS real (hallazgo de la inspección de módulos) — conectar TALOS primero resuelve esa inconsistencia de forma natural.

**Dependencias**: Fase C completa y con `CANONICAL_FIELDS_TRUSTED` activo y estable en producción por al menos un ciclo de observación (recomendado: 2 semanas, dado el cron de 15 min — suficiente para observar cientos de ciclos de lifecycle).

**Feature flag**: uno por consumidor (`CANONICAL_CONSUMER_MAP`, `CANONICAL_CONSUMER_NOTIFICATIONS`, `CANONICAL_CONSUMER_ATLAS`, etc.) — permite activar/desactivar cada conexión de forma independiente sin afectar a las demás.

**Rollback**: por consumidor, apagar su flag individual — vuelve a leer de la fuente legacy correspondiente sin afectar a los demás consumidores ya migrados.

**Riesgo**: bajo por consumidor, ya que cada uno es aislado; el riesgo agregado es de calendario (7 consumidores a migrar), no técnico.

---

## 5. Fase E — Retiro de modelos legacy

**Objetivo**: eliminar código y tablas que quedaron sin consumidores.

**Trabajo, en orden de riesgo ascendente**:
1. `src/lib/ingest/*` — confirmado huérfano (0 importadores) desde antes de esta migración. Se puede retirar en cualquier momento, incluso antes de Fase A, sin relación con el resto del plan.
2. `ExternalEventCorrelation` — confirmado write-only. Retirar tras confirmar que `IncidentRelation` (Fase C) cubre el mismo propósito.
3. Los dos mapeadores legacy (`vigiaIncidentToArgusEvent.ts`, `knowledgeIncidentToArgusEvent.ts`) y la construcción directa en `argusCorrelationEngine.correlateSignals()` — retirar solo tras Fase D punto 1 confirmado estable.
4. Los registros de fuente duplicados (`src/lib/vigia/sourceRegistry.ts` vs `src/lib/knowledge-intake/sourceRegistry.ts`) — consolidar en el `IncidentSource` de Fase A/C.
5. `ExternalEvent` — el consumidor real confirmado es solo `/api/notifications` (lectura directa) más el flujo de sismos vía polling del mapa. Retirar solo después de que Fase D punto 1-2 demuestre que sismos vía `Incident` cubren ese caso sin pérdida de cobertura ni de latencia percibida. `/api/external-events` (sin caller de frontend conocido) se puede retirar independientemente y antes, tras confirmar con el equipo que no hay integraciones externas ocultas.
6. `reviewStatus` en `KnowledgeIncident` — columna write-once nunca transicionada; retirar una vez que `verificationStatus` (Fase C) la reemplace funcionalmente.

**Dependencias**: cada ítem depende únicamente de la confirmación de "cero consumidores" — no es necesario esperar a que **todos** los ítems anteriores estén listos para retirar uno individual.

**Criterios de aceptación previos a cualquier retiro de esta fase** (obligatorios, no opcionales):
- Cero consumidores confirmados por grep + revisión de logs de acceso al endpoint/tabla en las últimas 4 semanas.
- Migración de datos (si aplica) completada y verificada con conteo de filas antes/después.
- Tests de regresión pasando (ver criterios de prueba del diseño, §19).
- Observabilidad activa mostrando el nuevo camino operando sin `mapping_failures`/`classification_conflicts` elevados durante al menos una semana.
- Plan de rollback explícito documentado *antes* de ejecutar el drop (aunque el drop en sí sea la única acción no reversible del plan completo).

**Rollback**: **no reversible** una vez ejecutado el `DROP`/borrado de código — por eso es la única fase que requiere los cinco criterios de aceptación arriba cumplidos simultáneamente antes de proceder, y por eso se ejecuta ítem por ítem, nunca en bloque.

**Riesgo**: variable por ítem (ver orden ascendente arriba) — mitigado por completo al no ejecutar ningún ítem hasta que sus criterios de aceptación específicos se cumplan.

---

## 6. Feature flags — resumen

| Flag | Fase | Efecto al activar | Efecto al desactivar (rollback) |
|---|---|---|---|
| `CANONICAL_MAPPER_ENABLED` | A | Endpoints de mapa usan el mapeador único | Vuelven a los 3 mapeadores legacy |
| `CANONICAL_READ_LAYER_ENABLED` | B | Endpoint de preview expone la vista unificada | Endpoint deja de responder |
| `CANONICAL_DUAL_WRITE_ENABLED` | C | Se escriben también las columnas canónicas nuevas | Columnas nuevas dejan de actualizarse, resto intacto |
| `CANONICAL_FIELDS_TRUSTED` | C | Lecturas prefieren columnas nuevas sobre JSON derivado | Lecturas vuelven a derivar de JSON como hoy |
| `CANONICAL_CONSUMER_<NOMBRE>` | D | Ese consumidor específico lee del modelo canónico | Ese consumidor vuelve a su fuente legacy, sin afectar otros |

Todos los flags son **aditivos e independientes** — no existe un flag maestro que los active todos a la vez, precisamente para que cada fase sea reversible sin arrastrar a las demás.

---

## 7. Comparación y métricas durante la transición

En cada fase con lectura dual (B, C, D) se recomienda registrar, sin actuar automáticamente sobre ellas:
- Tasa de discrepancia entre resultado legacy y resultado canónico, por tipo de amenaza.
- Latencia comparada de ambos caminos.
- Conteo de incidentes que el modelo canónico correlaciona distinto de como lo hacía la heurística de notificaciones actual (dedup por firma `tipo:lat:lng:bucket6h`).

Estas métricas son las que informan la decisión de avanzar de fase — no hay una fecha fija, hay un criterio de estabilidad observada.

---

## 8. Riesgos consolidados del plan

- **Pérdida de datos**: ninguna fase anterior a E borra datos; Fase E solo borra lo ya confirmado sin consumidores durante ≥4 semanas.
- **Doble escritura**: acotada a Fase C, con comparación automática antes de confiar en las columnas nuevas (`CANONICAL_FIELDS_TRUSTED` separado de `CANONICAL_DUAL_WRITE_ENABLED` intencionalmente, para poder escribir sin todavía leer).
- **Duplicación de notificaciones**: mitigada al mover el trigger de "cada evidencia" a "transición formal" en Fase D punto 2, antes de retirar la heurística de dedup por firma.
- **Incompatibilidad con datos legacy**: mitigada por columnas aditivas/nullable en Fase C y por mantener los mapeadores legacy operativos hasta que Fase D los reemplace y valide.
- **Rendimiento**: campos denormalizados (`sourceCount`/`evidenceCount`) evitan agregaciones nuevas costosas; caché de la capa de lectura de Fase B sigue el patrón TTL ya usado en el repo.
- **Rollback**: cada flag es independiente (§6) — revertir una fase nunca requiere revertir las posteriores porque las posteriores no pueden haber avanzado sin que la anterior estuviera estable.

---

## 9. Criterios de aceptación del plan en su conjunto

El plan de migración se considera completo cuando:
1. Los tres mapeadores legacy y `argusCorrelationEngine.correlateSignals()` fueron reemplazados por el mapeador único sin regresión detectada.
2. `KnowledgeIncident`/`Incident` tiene lifecycle, severidad y confianza como columnas tipadas, no JSON.
3. `Report`/`HelpRequest` tienen FK opcional a `Incident` poblada para al menos los casos correlacionados hacia adelante desde la activación de Fase C.
4. Los 7 consumidores de Fase D leen del modelo canónico con sus flags individuales estables (sin rollback) por al menos 2 semanas cada uno.
5. `src/lib/ingest/*`, `ExternalEventCorrelation`, los mapeadores legacy y los registros de fuente duplicados fueron retirados según los criterios de Fase E.
6. Ningún paso de este plan requirió una migración "big bang", commit único masivo, ni ventana de downtime.
