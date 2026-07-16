# ARGUS — Diseño de la Entidad Canónica de Incidente

**Fecha**: 2026-07-14
**Tipo**: especificación técnica de arquitectura — **solo diseño, sin implementación**.
**Alcance**: no se modificó `prisma/schema.prisma`, no se crearon migraciones, no se cambió código productivo, no se movieron datos, no se hizo commit ni push.
**Continúa**: `docs/audit/ARGUS_MASTER_AUDIT.md` §11 (pregunta 3: "¿qué modelo canónico usa?") y la recomendación de etapa única "Cerrar y Unificar", ítem "diseño de la entidad canónica de incidente".
**Documentos hermanos**: `ARGUS_CANONICAL_INCIDENT_DIAGRAMS.md` (diagramas Mermaid), `ARGUS_INCIDENT_MIGRATION_PLAN.md` (fases/rollback), `ARGUS_INCIDENT_FIELD_MAPPING.md` (matriz campo a campo).

---

## 1. Resumen ejecutivo

La auditoría maestra confirmó, con evidencia file:line, que ARGUS tiene **al menos cinco representaciones paralelas de "incidente"** (`KnowledgeIncident`, `Report`/`HelpRequest`, `ExternalEvent`, `Incident`/`IncidentCommandView` sintético, `ConflictZone`/`ConflictEvent` estático) más un silo de análisis (`RiskAssessment`) y una proyección de lectura (`ArgusEvent`) construida por **tres** mapeadores independientes que ya han divergido en producción (el fix de severidad verde GDACS v1.0.3.2 solo se aplicó a uno de los dos mapeadores de `KnowledgeIncident`).

Este documento recomienda **evolucionar `KnowledgeIncident` hacia la entidad canónica `Incident`** (Alternativa A, ver §6), apoyándose transitoriamente en una **capa canónica de lectura** (técnica de la Alternativa C) durante las primeras fases para no tocar el esquema hasta que el contrato esté validado. No se recomienda crear una tabla nueva desde cero (Alternativa B pura): el 70% de la infraestructura necesaria ya existe, funciona y está en producción (dedup por `[sourceId, externalId]`, tabla de evidencia real `KnowledgeEvidence`, barrido de lifecycle programado, resolución de geometría administrativa real para Chile).

El principio rector, tomado literalmente del mandato:

> Un incidente real posee una identidad canónica única, múltiples evidencias, múltiples fuentes, un lifecycle gobernado y varias proyecciones de consumo.

---

## 2. Inventario de modelos actuales (matriz de contrato)

| Modelo | Persistente | ¿Fuente de verdad hoy? | Lifecycle | Severidad | Confianza | Geometría | Evidencia | Consumidores reales |
|---|---|---|---|---|---|---|---|---|
| `KnowledgeIncident` | Sí (Prisma) | Sí, para Global Watch + SENAPRED promovido | Informal, en `technicalFactorsJson.lifecycle`; recalculado solo por el sweep del cron (`src/lib/vigia/incidentLifecycle.ts`) | `severity: string` libre (`low/medium/high/critical/unknown`), 3+ clasificadores independientes | `confidenceScore` 0-100, 2 fórmulas distintas coexisten | `latitude/longitude` + `geometryJson` libre | Sí, tabla dedicada `KnowledgeEvidence` (FK `incidentId`, sin `onDelete`) | `/api/vigia/events`, `/api/chile-alerts`, `/api/knowledge-intake/*`, notificaciones (solo high/critical), mapa 2D/Orbit 3D vía 2 mapeadores |
| `Report` | Sí (Prisma) | Sí, para reportes ciudadanos | `status` string libre (`NEW→VALIDATED/DISCARDED/ESCALATED/RESOLVED`), sin ventana de expiración | `severity` string libre (`LOW/MEDIUM/HIGH/CRITICAL`), calculado por keyword matching independiente | `aiConfidence` + `falseReportRisk`, sin relación con `confidenceScore` de `KnowledgeIncident` | `latitude/longitude` puntual únicamente | No — es evidencia potencial de otra cosa, no tiene evidencia propia | `/api/events`, `/api/reports`, `/api/admin/reports`, FENIX (`contextRetriever`/`predictiveFeed`), notificaciones |
| `HelpRequest` | Sí (Prisma) | Sí, para solicitudes de ayuda personales | `status` string libre (`RECEIVED→UNDER_REVIEW/ASSIGNED/RESOLVED/CANCELLED`) | `priority` string libre, reutiliza el rótulo `severity` solo en el DTO de `/api/events` | `aiConfidence`, misma duplicación que `Report` | `latitude/longitude` puntual | No | `/api/events`, `/api/help-requests`, FENIX, notificaciones |
| `ExternalEvent` | Sí (Prisma) | No — legado, escrito solo como efecto secundario de polling del mapa/notificaciones, sin cron propio | `expiresAt` existe pero **nunca se filtra en ninguna query** (campo muerto confirmado) | `severity` string libre, sin normalización | `confidence` numérico opcional | `latitude/longitude` puntual | No | `/api/notifications` (lectura directa), `/api/external-events` (sin caller de frontend conocido) |
| `Incident` / `IncidentCommandView` | **No** — en memoria/`globalThis`, sin Prisma | No — 100% sintético, `persistent: false` y `dataMode` documentados así en el propio código | `status` tipado (`NEW→CLOSED/DISMISSED`) pero sin datos reales que lo conduzcan | `severity` + `severityMode: "simulated"` explícito (nunca `"operational"` hoy) | `confidence` sintético | `lat/lng/radiusKm` sintético | `IncidentEvidence` (sub-tipo local, sintético) | `/api/incidents`, `/api/command/overview`, `CommandCenterPanel.tsx` |
| `ConflictZone` / `ConflictEvent` | **No** — array TS estático en `src/data/conflictZones.ts` | No — curado a mano, 2/3 eventos semilla son placeholders declarados (`"GDELT placeholder"`) | `isActive` booleano | `riskLevel`/`severity` string libre | `confidence` estático | `point/polygon/bbox` | `sources: ConflictSourceLink[]` embebido | `/api/conflict-zones`, `/api/conflict-events`, capa de mapa ATLAS |
| `RiskAssessment` | Sí (Prisma) | Parcial — silo de análisis, no de detección | `status` string libre, sin relación con lifecycle de incidente | `severity` string libre, propia | `confidence` + `probabilityScore`/`probabilityBand` | Ninguna — hereda la del evento relacionado vía `relatedExternalEventIds` | `evidence: Json[]` embebido | TALOS, `/api/risk-assessments`, `useArgusEventAnalysis` |
| `ArgusEvent` | **No** — DTO puro, sin tabla | No es fuente, es proyección | `status` (`observation→archived`), recalculado en cada mapeo, sin persistir | `severity` 5 niveles (`info/low/medium/high/critical`) — el contrato más limpio de todos | `confidence` 5 niveles (`low/medium/medium_high/high/verified`) — también el más maduro | Contrato ya excelente: discriminated union `point/polygon/route/region_reference/administrative_area` + `geometryPrecision` de 13 valores, con nota explícita "nunca un bbox" | `sources: ArgusSourceReference[]` embebido | Mapa 2D (`ArgusEventLayer`), Orbit 3D (`GlobeView`), paneles de detalle |

**Hallazgo clave para el diseño**: `ArgusEvent` ya tiene el mejor contrato de severidad/confianza/geometría de todo el sistema — pero es un DTO sin persistencia. La estrategia correcta no es inventar un contrato nuevo, sino **promover el contrato de `ArgusEvent` a nivel de fuente de verdad** (§13) y dejar de reconstruirlo con lógica divergente en tres sitios distintos.

---

## 3. Qué NO implica esta unificación

Por diseño, y siguiendo el principio central del mandato:

- No implica una única tabla con todos los campos de todos los modelos.
- No implica eliminar `Report`, `HelpRequest`, `RiskAssessment` o `ConflictZone` — cada uno representa un concepto legítimamente distinto (petición de ayuda personal, evaluación de riesgo, capa geopolítica estática) y **seguirá existiendo**, correlacionado, no fusionado.
- No implica convertir `ArgusEvent` en tabla — sigue siendo proyección de lectura.
- No implica fusionar datos incompatibles sin trazabilidad — toda fusión pasa por `IncidentRelation` + `IncidentAuditLog`/`IncidentTransition` (§7.5, §10).

```text
Incidente canónico  ≠ evidencia ≠ fuente ≠ observación ≠ reporte ciudadano
                     ≠ alerta oficial ≠ predicción ≠ recomendación
                     ≠ notificación ≠ representación en mapa
```

---

## 4. Decisión sobre la fuente de verdad

### Alternativa A — Evolucionar `KnowledgeIncident` (recomendada, como estado final)

**A favor**: ya persiste desde 8 fuentes reales con cron cada 15 min; ya tiene tabla de evidencia dedicada (`KnowledgeEvidence`) con FK; ya tiene dedup real (`[sourceId, externalId]` + `buildGlobalDedupKey`); ya alimenta el mapa (aunque por dos mapeadores); ya tiene un sweep de lifecycle programado con ventanas por tipo de amenaza ya calibradas (`src/lib/vigia/incidentLifecycle.ts`); el gasto de ingeniería en canonicalización de severidad (GDACS v1.0.3.2) es reutilizable.

**Riesgos, y cómo se mitigan en este diseño**: lifecycle en JSON → se formaliza como columna/enum en Fase C (§7.6 de este documento y Fase C del plan de migración); nombre ligado a "knowledge-intake" → el nombre lógico pasa a ser `Incident` desde la Fase A (a nivel de tipos TS), el nombre físico de tabla se resuelve en Fase C sin necesidad de romper compatibilidad (Prisma permite `@@map("KnowledgeIncident")` si se prefiere no renombrar la tabla físicamente todavía); campos insuficientes para reportes ciudadanos → se resuelve con FK opcional `incidentId` en `Report`/`HelpRequest` (§9), no fusionando las tablas; deuda acumulada (dos mapeadores, dos registros de fuentes) → se retira en Fase A/B con el mapeador único (§13).

### Alternativa B — Crear un `Incident` nuevo desde cero

Contrato limpio, pero **alto riesgo de convertirse en un sexto modelo paralelo** mientras dura la migración (que, por mandato, debe ser incremental y no "big bang"). Requiere doble escritura sostenida más tiempo, reconstruir dedup/evidencia que ya funcionan, y no aprovecha el sweep de lifecycle ya calibrado por tipo de amenaza. Se descarta como estrategia principal.

### Alternativa C — Capa canónica lógica sobre modelos existentes

Menor impacto inicial y es la técnica correcta para las **Fases A y B** (contratos + proyección de lectura unificada sin tocar el esquema), pero **como estado final es la causa raíz que la propia auditoría diagnostica** ("acumulación de subsistemas sin capa de unificación"): si nunca se consolida en persistencia real, la identidad sigue distribuida. Se adopta como **medio de transición**, no como destino.

### Decisión final

**Recomendación: Alternativa A como estado final, usando las técnicas de la Alternativa C como puente de las Fases A–B.** Es la secuencia de menor riesgo: primero unificar la lectura (cero cambios de esquema, revierte con un flag), validar en producción comparando contra el comportamiento actual, y solo entonces evolucionar físicamente `KnowledgeIncident` hacia `Incident`.

---

## 5. Modelo conceptual canónico

### 5.1 `Incident` (evolución de `KnowledgeIncident`)

Representa el hecho o situación operacional — no el registro de una fuente, no una evidencia individual.

| Campo | Justificación |
|---|---|
| `id` | Identidad interna estable (cuid), ya existe. |
| `canonicalKey` | **Nuevo.** Clave de correlación determinística y persistida (hoy `buildGlobalDedupKey` se calcula al vuelo y se descarta — formalizarla permite reconsultar/reabrir sin recalcular todo el historial). |
| `type` / `subtype` | Evolución de `domain`/`subtype` — se mantiene el nombre `type` para alinear con el vocabulario de `ArgusEventType` y evitar una tercera taxonomía. |
| `title` / `summary` | Ya existen, sin cambios de semántica. |
| `status` | **Nuevo campo tipado** (hoy vive en JSON) — ver lifecycle §7. |
| `sourceSeverity` / `normalizedSeverity` / `assessedSeverity` / `effectiveSeverity` | Reemplaza el `severity` único — ver §8. Preserva la severidad original sin pérdida. |
| `confidenceScore` (0-100) + `confidenceLevel` (enum derivado) | Se conserva el score numérico (la lógica de `evidenceScoring.ts` ya es razonable) y se añade el nivel para exponer una sola fuente de la verdad a notificaciones/UI. |
| `verificationStatus` | **Nuevo** — ver §9. Reemplaza el `reviewStatus` write-once que hoy nunca transiciona. |
| `scope` | **Nuevo** — `LOCAL/REGIONAL/NATIONAL/GLOBAL`, ya existe como concepto en `ArgusNotification.scope`; se promueve a nivel de incidente. |
| `countryCode` / `regionCode` / `locality` | Renombre de `country`/`region`/`locality` a códigos donde exista catálogo (ISO/INE), string libre donde no. |
| `eventLocation` / `affectedArea` / `warningArea` / `administrativeScope` / `displayBounds` | Reemplaza `latitude/longitude` + `geometryJson` libre por el contrato ya maduro de `ArgusGeometry` — ver §10. |
| `startedAt` | **Nuevo** — momento estimado de inicio del hecho (distinto de cuándo ARGUS lo detectó). |
| `detectedAt` | Ya existe. |
| `confirmedAt` | **Nuevo** — cuándo pasó a `verificationStatus: OFFICIAL` o `CORROBORATED`. |
| `updatedAt` | Ya existe. |
| `resolvedAt` / `archivedAt` | **Nuevos** — hoy son estados JSON sin timestamp propio. |
| `expiresAt` | Se mantiene el nombre (ya existe en `ExternalEvent`, útil de trasladar) pero esta vez **se define su uso obligatorio en queries** (§7, corrige el campo muerto documentado). |
| `sourceCount` / `evidenceCount` | **Nuevos**, contadores derivados — evitan `COUNT` repetido en cada lectura para notificaciones/UI. |
| `isOfficial` | **Nuevo** — derivado de si alguna evidencia tiene `isOfficial: true`; usado por notificaciones para no mezclar predicción con alerta oficial (§14). |
| `isSynthetic` / `isDemo` | Se preserva el patrón ya bien diseñado de `IncidentDataMode`/`isDemo` visto en `src/types/incident.ts` y `demoDataGuard.ts` — es el único mecanismo del repo que ya previno con éxito una fuga de datos demo. |
| `createdAt` | Ya existe. |

No es obligatorio adoptar exactamente estos nombres al implementar — lo obligatorio es la separación conceptual que representan.

### 5.2 `IncidentSource`

Organización/sensor/plataforma/actor que aporta información: USGS, GDACS, SENAPRED, FIRMS, ciudadano, medio, modelo ARGUS.

**Hallazgo de la inspección**: hoy existen **tres registros de fuente distintos** (`src/lib/vigia/sourceRegistry.ts`, `src/lib/knowledge-intake/sourceRegistry.ts`, y la tabla Prisma `KnowledgeSource`), no correlacionados entre sí. Se recomienda que `IncidentSource` sea la **unificación de esos tres registros** en Fase A (a nivel de tipos), consolidando en la tabla `KnowledgeSource` ya existente en Fase C en lugar de crear una cuarta tabla. Campos: `id`, `name`, `type` (`official/technical/news/citizen/global_feed/model_context`, ya modelado en `ArgusSourceType`), `reliabilityScore` (ya existe en `KnowledgeSource`), `officialSource` (ya existe), `enabled` (ya existe).

### 5.3 `IncidentEvidence` (evolución de `KnowledgeEvidence`)

Pieza concreta de evidencia. `KnowledgeEvidence` ya tiene casi todo lo requerido (`incidentId`, `sourceId`, `sourceName`, `evidenceType`, `title`, `url`, `excerpt`, `rawRef`, `confidenceScore`, `metadataJson`). Se añaden:

| Campo nuevo | Motivo |
|---|---|
| `externalId` | **Se traslada aquí desde `Incident.externalId`.** Un incidente puede tener evidencia de varios orígenes, cada una con su propio ID externo (p. ej. el mismo terremoto tiene ID USGS y ID GDACS distintos) — hoy `KnowledgeIncident.externalId` es singular y solo registra el primero. |
| `publishedAt` / `observedAt` / `receivedAt` | Distingue cuándo la fuente publicó, cuándo ocurrió lo observado y cuándo ARGUS lo recibió — hoy se mezclan en `occurredAt`/`fetchedAt` a nivel de incidente, perdiendo granularidad por evidencia. |
| `geometry` | Cada evidencia puede aportar una geometría distinta (polígono FIRMS vs. punto USGS) que se agrega, no se sobrescribe, en `Incident.affectedArea`. |
| `severityReported` / `statusReported` | Preserva literalmente lo que la fuente dijo, antes de cualquier normalización — necesario para no perder la severidad original (mandato §11). |
| `isPrimary` / `isOfficial` | Ya usado implícitamente (SENAPRED, GDACS oficial) — se formaliza para alimentar `Incident.isOfficial` y las reglas de notificación oficial vs. predicción. |

### 5.4 `IncidentObservation` — decisión: **no se crea como tabla separada**

El mandato pide decidir si se separa de `Evidence`. Se decide **no separar**: las observaciones que cambian en el tiempo (magnitud sísmica, superficie quemada, caudal, nivel del mar) se modelan como filas de `IncidentEvidence` con `evidenceType: "observation"` y `observedAt` poblado, usando `metadataJson` para el valor medido específico. Justificación: `KnowledgeEvidence` ya es una tabla append-only por diseño (no hay `UPDATE` de evidencia existente en el código inspeccionado, solo inserción), que es exactamente la semántica que una serie de observaciones necesita. Crear una novena tabla paralela solo para diferenciar "observación" de "evidencia" repetiría el patrón que esta tarea busca corregir. Si en el futuro el volumen de observaciones de series temporales (p. ej. telemetría de sensores) lo justifica, se puede particionar entonces — no antes.

### 5.5 `IncidentRelation`

No existe hoy un equivalente activo — el candidato más cercano es `ExternalEventCorrelation`, confirmado **write-only** (se persiste en cada corrida de `correlateExternalEvents.ts` pero ningún endpoint ni componente lo lee). Se recomienda que `IncidentRelation` retome ese propósito, más semántica de duplicados:

`kind`: `duplicate_of | caused_by | related_to | escalates | child_of | triggered_by | affects | supersedes`, con `fromIncidentId`, `toIncidentId`, `confidence`, `explanation`, `createdAt` — estructura casi idéntica a la de `ExternalEventCorrelation`, que puede evolucionar directamente en Fase C.

### 5.6 `IncidentAssessment` (evolución de `RiskAssessment`)

La inspección confirmó que `RiskAssessment.relatedExternalEventIds` **ya es una correlación real y activamente consultada** (no un blob JSON muerto): `riskEngine.ts` la usa para contexto histórico, y `/api/risk-assessments` la usa como índice de consulta (`?externalEventId=`, `?reportId=`). Esto simplifica la migración: en vez de rediseñar la relación, **se reemplaza el array `Json` de IDs sueltos por una FK real `incidentId`** una vez exista el `Incident` canónico, preservando el resto del contrato (`riskType`, `probabilityBand`, `probabilityScore`, `confidence`, `severity`, `recommendedAction`, `evidence`). `RiskAssessmentRevision` se conserva tal cual como precedente de auditoría estructurada (ver `IncidentTransition`, §5.8).

### 5.7 `IncidentAction`

Se decide **no crear una entidad de primera clase todavía**. Hoy `recommendedAction`/`recommendedActionsJson`/`recommendedActions` son campos de texto/array dispersos en `RiskAssessment`, `KnowledgeIncident` y `ArgusEvent` — ninguno de los tres necesita hoy trackear el ciclo de vida individual de una acción (emitida/reconocida/completada). Se mantiene como **array de texto en `Incident.recommendedActions`** heredado directamente del contrato ya maduro de `ArgusEvent.recommendedActions`. Promover a tabla completa (`IncidentAction` con su propio estado) queda como extensión de Fase F, condicionada a que HERMES/ARCA necesiten trackear acciones individualmente — no es un requisito del MVP canónico.

### 5.8 `IncidentAuditLog` / `IncidentTransition`

Se reutiliza la tabla genérica `AuditLog` ya existente (`actorUserId`, `action`, `targetType`, `targetId`, `metadata`) para auditoría general con `targetType: "Incident"` — evita una tabla `IncidentAuditLog` redundante. Para las transiciones de lifecycle/severidad específicamente (que necesitan campos estructurados antes/después, no solo un `metadata` Json libre), se recomienda una tabla pequeña y dedicada `IncidentTransition`, calcada del patrón ya probado de `RiskAssessmentRevision`: `incidentId`, `previousStatus`, `newStatus`, `previousSeverity`, `newSeverity`, `reason`, `actorId` (nulo si es automático), `createdAt`. Este patrón ya existe y funciona en el repo — se reutiliza su forma, no se reinventa.

---

## 6. Relaciones entre entidades

```text
Incident 1───N IncidentEvidence  N───1 IncidentSource
Incident 1───N IncidentAssessment
Incident 1───N IncidentTransition
Incident N───N Incident            (vía IncidentRelation: duplicate_of/caused_by/...)
Incident 1───N (Report | HelpRequest)   [FK opcional incidentId, nunca obligatoria]
Incident 1───1 ArgusEvent          (proyección de lectura, no persistida)
```

Ver diagrama ER completo en `ARGUS_CANONICAL_INCIDENT_DIAGRAMS.md` §1.

---

## 7. Identidad canónica y deduplicación

### 7.1 Tres claves, no equivalentes

```text
Incident.id                → identidad interna estable (cuid), nunca cambia, nunca se reutiliza.
IncidentEvidence.externalId → identidad entregada por la fuente (p. ej. "us7000abcd" de USGS).
Incident.canonicalKey       → clave de correlación calculada, puede recalcularse; determina qué
                               evidencia nueva se adjunta a qué Incident existente.
```

### 7.2 Reglas de correlación por categoría (formalizando lo ya implementado)

| Categoría | Regla primaria | Regla de respaldo |
|---|---|---|
| **Sismos** | ID nativo de fuente gana (USGS/GDACS/CSN no se funden por bucket geo-temporal — decisión ya tomada y comentada en `dedup.ts`) | `canonicalKey = país:amenaza:lat±0.25°:lng±0.25°:hora±1h` solo para agrupar corroboración entre fuentes, nunca para decidir identidad |
| **Incendios** | Clustering de hotspots FIRMS/EFFIS/Copernicus EMS ya implementado en `firmsClusterer.ts` — se preserva la ventana de agrupación existente | `canonicalKey` con redondeo de coordenada más amplio (hasta 1°) y bucket de 24-72h, ya calibrado por tipo en `LIFECYCLE_WINDOWS` |
| **Alertas oficiales (SENAPRED)** | `sourceId + externalId` del alerta, con las actualizaciones de nivel tratadas como nueva evidencia sobre el mismo `Incident`, no como incidente nuevo | Texto de cancelación/modificación (`chileAlertLifecycle()`) dispara transición de estado, no un nuevo `canonicalKey` |
| **Salud pública** | `país + patógeno + período` (WHO DON/ECDC) | Ventana de 30 días para considerar la misma emergencia epidemiológica |
| **Reportes ciudadanos** | Nunca crean identidad por sí solos con menos de 1 corroboración | Proximidad (≤500m), ventana ≤6h, mismo `type` → candidatos a evidencia de un `Incident` existente; si no hay match, crean un `Incident` en `verificationStatus: UNVERIFIED` |

### 7.3 Cuándo fusionar / vincular / mantener separado

- **Se fusiona** (misma evidencia, mismo `canonicalKey`, misma ventana temporal): se adjunta como nueva `IncidentEvidence` al `Incident` existente; `updatedAt` avanza; no se crea fila nueva.
- **Se vincula sin fusionar** (`IncidentRelation`): eventos relacionados pero distintos — un sismo (`caused_by`) que dispara un tsunami, una réplica (`related_to`), una escalada de alerta SENAPRED (`escalates`).
- **Se mantiene separado**: dos incidentes del mismo tipo en la misma región pero con evidencia que no comparte ventana temporal ni geometría — no se fuerza correlación por coincidencia de categoría.
- **Se marca `DUPLICATE`**: cuando un operador o una regla automática confirma que dos `Incident` distintos describen el mismo hecho (p. ej. creados por dos pipelines antes de la unificación) — el más nuevo pasa a `status: DUPLICATE` con `IncidentRelation(kind: duplicate_of)` apuntando al canónico; las lecturas excluyen `DUPLICATE` por defecto.
- **Se crea un incidente padre**: cuando una `HUMANITARIAN_CRISIS` agrupa múltiples incidentes hijos (`child_of`) — no se fusiona la evidencia, se preserva la jerarquía.

---

## 8. Lifecycle canónico

### 8.1 Estados

```text
DETECTED → VALIDATING → CONFIRMED → ACTIVE → ESCALATING → MONITORING
                                        ↓                      ↓
                                   CONTAINED ──────────────→ RESOLVED → ARCHIVED
REJECTED, DUPLICATE: estados terminales alcanzables desde cualquier punto antes de RESOLVED.
```

Diagrama de estados completo (Mermaid) en `ARGUS_CANONICAL_INCIDENT_DIAGRAMS.md` §3.

| Estado | Significado | Entrada | Salida | Actor | Automática/Manual | Visible en mapa | Notifica | Cuenta como activo |
|---|---|---|---|---|---|---|---|---|
| `DETECTED` | Señal recibida, sin validar | Primera evidencia recibida | — | Sistema | Auto | No (o marcado "no confirmado") | No | No |
| `VALIDATING` | En proceso de corroboración | `confidenceScore` bajo el umbral de auto-aceptación | Nueva evidencia corrobora, o expira sin corroborar | Sistema | Auto | Opcional, atenuado | No | No |
| `CONFIRMED` | Al menos una fuente oficial o corroboración suficiente | `verificationStatus → OFFICIAL/CORROBORATED` | — | Sistema | Auto | Sí | **Sí** (`incident.confirmed`) | Sí |
| `ACTIVE` | Situación en curso, fuente actualizando | Confirmado y dentro de la ventana `activeHours` del tipo de amenaza (reutiliza `LIFECYCLE_WINDOWS` ya calibrado) | Sin actualización > `activeHours` | Sistema | Auto | Sí | Solo si escala | Sí |
| `ESCALATING` | Severidad o alcance territorial aumentó | `effectiveSeverity` sube, o `scope` se amplía | Se estabiliza | Sistema | Auto | Sí, destacado | **Sí** (`incident.escalated`) | Sí |
| `MONITORING` | Sin actualización reciente pero no resuelto | > `activeHours` sin nueva evidencia | Nueva evidencia (→`ACTIVE`) o > `resolveHours` (→`RESOLVED`) | Sistema | Auto | Sí, atenuado | No | Sí |
| `CONTAINED` | Fuente oficial declara control (ya detectado por `CONTAINED_PATTERN`) | Texto/campo de fuente indica contención | Nueva evidencia de reactivación, o expira → `RESOLVED` | Sistema | Auto | Sí | No | Sí |
| `RESOLVED` | Cerrado, aún visible | > `resolveHours` sin actualización, o cierre explícito | Vencido el período de gracia (§8.2) → `ARCHIVED`; reapertura → `ACTIVE` | Sistema u operador | Ambas | Sí, sección "resueltos recientes" | **Sí** (`incident.resolved`) | **No** — corrige el bug de fatiga de alertas documentado en la auditoría |
| `ARCHIVED` | Fuera de vista operativa, conservado para historial | Vencido el período de gracia post-`RESOLVED` | Reapertura manual excepcional (auditada) | Sistema | Auto | No (solo vía historial explícito) | No | No |
| `REJECTED` | Falso positivo confirmado | Decisión manual (`OPERATOR`/`ADMIN`) o corroboración negativa | — (terminal) | Operador | Manual | No | No | No |
| `DUPLICATE` | Redundante con otro `Incident` | `IncidentRelation(duplicate_of)` confirmada | — (terminal, salvo separación manual) | Sistema u operador | Ambas | No (redirige al canónico) | No | No |

### 8.2 Resolución de las preguntas obligatorias del mandato

- **¿`RESOLVED` sigue visible?** Sí, pero **no cuenta como activo** en contadores/campana (corrige el hallazgo de fatiga de alertas de `ARGUS_DATA_FLOW.md` §5) — se muestra en una sección separada "resueltos recientes" durante el período de gracia.
- **¿Cuánto tiempo permanece antes de `ARCHIVED`?** Se reutiliza `resolveHours` del tipo de amenaza (ya calibrado por categoría en `LIFECYCLE_WINDOWS`) como período de gracia adicional tras `RESOLVED` — es decir, `ARCHIVED` ocurre a las `resolveHours × 2` desde la última actualización, exactamente como ya calcula `computeLifecycle()` hoy (se formaliza, no se reinventa el umbral).
- **¿Cómo se reabre?** Nueva evidencia con `canonicalKey` coincidente sobre un `Incident` en `RESOLVED` o `ARCHIVED` → transición automática a `ACTIVE` + `IncidentTransition(reason: "reopened_by_new_evidence")`.
- **¿Qué ocurre si una fuente publica una actualización posterior?** Se adjunta como nueva `IncidentEvidence`; si cambia la severidad/estado reportado, dispara reevaluación de `normalizedSeverity`/`effectiveSeverity` y posible transición de lifecycle (p. ej. `MONITORING → ACTIVE`).
- **¿Qué ocurre si se detecta que era falso?** Transición manual a `REJECTED` con `IncidentTransition(reason, actorId)` obligatorio; se retira de mapa/notificaciones pero se conserva para auditoría (nunca se borra).
- **¿Qué ocurre con duplicados?** Ver `DUPLICATE` arriba — el registro persiste pero deja de ser navegable/notificable directamente.

---

## 9. Severidad canónica

Escala única de 5 niveles, alineada con la ya madura `ArgusSeverity` de `ArgusEvent` (se evita introducir una sexta escala):

```text
INFO < LOW < MODERATE < HIGH < CRITICAL
```

Se elimina el valor `"unknown"` como nivel de severidad (hoy presente en `ArgusIncidentSeverity`) — la ausencia de severidad evaluable se modela como `normalizedSeverity: null` (no evaluado), nunca como un quinto nivel falso que un consumidor podría comparar incorrectamente contra los demás.

### 9.1 Cuatro dimensiones, nunca colapsadas en un solo campo

| Campo | Quién lo escribe | Se pierde nunca |
|---|---|---|
| `sourceSeverity` | Copiado literal de `IncidentEvidence.severityReported`, por fuente | No — se preserva el string/valor original de cada fuente indefinidamente |
| `normalizedSeverity` | Un **único** clasificador canónico por familia de fuente (reemplaza los 3+ clasificadores hoy dispersos: `threatClassifier.ts`, `gdacsSeverity.ts`, `severeWeatherClassifier.ts`, lógica embebida en `firmsClusterer.ts`) — registro de estrategias por `sourceType`, no un if/else monolítico | Se recalcula si cambia la evidencia, pero cada recálculo queda trazado en `IncidentTransition` si cambia el nivel |
| `assessedSeverity` | `IncidentAssessment` (TALOS) — puede diferir de `normalizedSeverity` porque incorpora contexto de exposición/impacto | Independiente, no sobrescribe `normalizedSeverity` |
| `effectiveSeverity` | Calculado: `max(normalizedSeverity de toda la evidencia, assessedSeverity)`, salvo `severityOverride` humano presente | Es el único campo que el mapa/notificaciones deben leer para "la severidad" |

`severityOverride` (nullable) + `overriddenBy` + `overriddenAt` + `overrideReason`: permite corrección humana sin perder ninguna de las cuatro señales anteriores — exactamente el patrón que ya salvó el bug GDACS v1.0.3.2, generalizado para no depender de un parche puntual la próxima vez.

---

## 10. Confianza y verificación

Dos dimensiones separadas, nunca mezcladas con severidad (mandato §12).

### 10.1 Confianza

`confidenceScore` (0-100, se conserva la lógica existente de `evidenceScoring.ts` como la fórmula canónica única — reemplaza la fórmula simplificada duplicada de `globalWatchEngine.ts` y los valores hardcodeados de `alertPromotionEngine.ts`) + `confidenceLevel` derivado: `LOW < MEDIUM < HIGH < VERY_HIGH`.

### 10.2 Estado de verificación

`UNVERIFIED → CANDIDATE → CORROBORATED → OFFICIAL`, con `REJECTED` como terminal alcanzable desde cualquier estado.

- **Quién puede elevar confianza**: automáticamente el sistema (corroboración multi-fuente, ya implementado como `mergeCorroboratingEvents`, +8 por fuente adicional); manualmente un `OPERATOR`/`ADMIN` puede forzar `OFFICIAL` con evidencia de respaldo.
- **Cuándo una fuente oficial basta**: una sola evidencia con `isOfficial: true` de una fuente con `IncidentSource.officialSource: true` (SENAPRED, USGS, GDACS) lleva directamente a `CORROBORATED` como mínimo; a `OFFICIAL` si es la fuente primaria del dominio (p. ej. USGS para sismos).
- **Cuántas fuentes se requieren**: 1 oficial, o 2 no-oficiales independientes dentro de la ventana de correlación de la categoría (§7.2), para salir de `CANDIDATE`.
- **Noticia**: entra como evidencia `sourceType: news`, nunca sube por sí sola de `CANDIDATE`; si cita una autoridad oficial (`officialAuthorityMentioned`), se marca `needsOfficialConfirmation: true` (patrón ya existente en `ArgusEvent`, se preserva íntegro).
- **Reporte ciudadano**: entra como `UNVERIFIED`; requiere corroboración (otro reporte o fuente oficial) para subir a `CANDIDATE`; nunca alcanza `OFFICIAL` solo con reportes ciudadanos.
- **Predicción**: nunca escribe `verificationStatus` de un `Incident` — vive exclusivamente en `IncidentAssessment`, que es una dimensión distinta (§5.6). Esto es lo que impide, por diseño, que una predicción TALOS se confunda con una alerta oficial en notificaciones (§14).
- **Comunicación de incertidumbre**: `confidenceLevel` + `verificationStatus` se serializan siempre juntos en `ArgusEvent` (a diferencia de hoy, donde la categoría oficial/análisis/candidato se calcula server-side y **nunca llega al cliente**, según `ARGUS_DATA_FLOW.md` §5 — este es un defecto explícito a corregir).

---

## 11. Geografía

Se adopta íntegro el contrato `ArgusGeometry` ya diseñado en `src/types/argusEvent.ts` como la geometría del propio `Incident` (no solo de su proyección):

```text
eventLocation        → geometry: point (siempre presente, aunque sea aproximado)
affectedArea          → geometry: polygon | administrative_area (huella real, cuando existe)
warningArea            → geometry: administrative_area distinta de affectedArea (alcance del alerta oficial, puede ser mayor que el área realmente afectada)
administrativeScope   → countryCode/regionCode/locality (ya existen como strings)
displayBounds          → EXCLUSIVAMENTE para encuadre de cámara/mapa — nunca se renderiza como geometría de alerta (regla ya escrita como comentario en el tipo `ArgusGeometry` de origen, se hace explícita como regla de diseño obligatoria aquí)
```

Esto resuelve directamente el hallazgo de la auditoría ("remanente del bug de rectángulo en el adaptador SENAPRED en vivo", mapa 68%): al promover `ArgusGeometry` a nivel de fuente de verdad en lugar de reconstruirlo en cada mapeador, un bbox nunca puede colarse como `affectedArea`/`warningArea` porque el tipo mismo no lo permite (el discriminated union no tiene una variante `bbox`).

---

## 12. Fuentes, evidencia y trazabilidad

Cada `Incident` debe poder responder, consultando solo `IncidentEvidence` + `IncidentTransition`:

| Pregunta | Campo que la responde |
|---|---|
| ¿Quién lo detectó? | Primera `IncidentEvidence` por `receivedAt` |
| ¿Qué fuente lo confirmó? | `IncidentEvidence` con `isOfficial: true` u origen de la transición a `CONFIRMED` |
| ¿Qué evidencia existe? | `IncidentEvidence` por `incidentId` |
| ¿Qué transformó ARGUS? | `metadataJson.adapterVersion` + `metadataJson.transformationVersion` por evidencia (nuevo, formaliza lo que hoy es implícito) |
| ¿Qué regla asignó severidad? | `metadataJson.severityRuleId` (identificador del clasificador de §9 que corrió) |
| ¿Quién cambió su estado? | `IncidentTransition.actorId` (nulo = automático) |
| ¿Qué datos se descartaron? | `IncidentTransition` con `reason` tipo `"discarded_low_confidence"`, o evidencia con `metadataJson.discarded: true` en vez de borrado físico |
| ¿Qué fuentes discreparon? | Múltiples `IncidentEvidence.severityReported` distintos en la misma ventana — visible sin cálculo adicional porque nunca se sobrescriben |

Política de payload: `rawPayloadReference` (referencia/hash, no el JSON completo salvo para fuentes de bajo volumen como SENAPRED) — se preserva el patrón ya usado (`raw: Json?` en `ExternalEvent` hoy guarda el payload completo sin límite; para el canónico se recomienda **hash + referencia externa** para fuentes de alto volumen como FIRMS, y payload completo solo para fuentes de bajo volumen/alto valor legal como alertas oficiales).

---

## 13. Reportes ciudadanos

Tres conceptos explícitamente distintos (mandato §15):

```text
Reporte sobre un incidente existente        → nueva IncidentEvidence (evidenceType: "citizen_report",
                                                isOfficial: false), Report conserva su propia fila/lifecycle
                                                de moderación (trust score, strikes) intacto.
Solicitud de ayuda derivada de un incidente → HelpRequest se correlaciona (FK opcional incidentId) SOLO
                                                cuando cae dentro de la ventana espacio-temporal de un
                                                Incident existente; nunca se auto-promueve a incidente.
Incidente creado desde reporte ciudadano     → cuando no hay Incident existente en el radio de correlación,
                                                se crea uno nuevo en verificationStatus: UNVERIFIED,
                                                confidence: LOW, requiere corroboración antes de CANDIDATE.
```

**FK, no fusión**: se añade `incidentId String?` (nullable) a `Report` y a `HelpRequest` en Fase C — cada tabla conserva su propio ciclo de moderación/asignación, que es un dominio distinto (confianza del usuario, asignación operativa) del lifecycle del incidente. Esto responde directamente la pregunta obligatoria 4 del mandato.

---

## 14. `ArgusEvent` como proyección

`ArgusEvent` **se mantiene como DTO** — no se convierte en tabla. Se define un único mapeador:

```text
Incident (+ IncidentEvidence + IncidentSource + IncidentAssessment)
    → canonicalIncidentToArgusEvent()
    → Mapa 2D (ArgusEventLayer) + Orbit 3D (GlobeView)
```

Reemplaza los **tres** sitios de construcción hoy existentes (`vigiaIncidentToArgusEvent.ts`, `knowledgeIncidentToArgusEvent.ts`, y la construcción directa dentro de `argusCorrelationEngine.correlateSignals()` usada por `/api/argus/events`).

| Campo de `ArgusEvent` | Origen |
|---|---|
| `id`, `title`, `country/region/province/commune` | `Incident` |
| `eventType` | `Incident.type/subtype` vía un único clasificador (ya no dos) |
| `severity` | `Incident.effectiveSeverity` |
| `status` | `Incident.status` (lifecycle canónico, ya no dos vocabularios distintos por mapeador) |
| `confidence` | `Incident.confidenceLevel` |
| `sourceType`, `sources[]`, `attribution` | `IncidentSource` + `IncidentEvidence` |
| `geometry`, `geometryPrecision` | `Incident.affectedArea`/`warningArea`/`eventLocation` (ya en el formato correcto, sin transformación) |
| `validFrom/validUntil` | `Incident.startedAt`/`expiresAt` |
| `detectedAt`/`lastUpdated` | `Incident.detectedAt`/`updatedAt` |
| `operationalSummary` | `Incident.summary` |
| `recommendedActions` | `Incident.recommendedActions` o el `IncidentAssessment` más reciente |
| `relatedSignals` | `IncidentRelation` |
| `needsOfficialConfirmation`, `officialAuthorityMentioned` | Derivado de evidencia `sourceType: news` con mención de autoridad, sin corroboración oficial aún |
| `isDemo` | `Incident.isDemo` |

Versión del contrato: se añade `contractVersion` al DTO para permitir evolución sin romper consumidores durante la migración (mismo patrón que "adapter version" en trazabilidad, §12).

---

## 15. Notificaciones como proyección

> La taxonomía canónica de categoría/verificación efectivamente implementada
> para `/api/notifications` (Prompt 11, 2026-07-14) vive en
> `docs/product/ARGUS_NOTIFICATION_TAXONOMY.md` — este documento sigue
> describiendo el destino conceptual (`Incident`/`IncidentTransition` como
> fuente); la taxonomía de notificaciones ya implementada opera hoy sobre el
> modelo actual (`KnowledgeIncident`/`Report`/`HelpRequest`/etc.), no sobre
> el `Incident` canónico todavía no persistido.

```text
Incident + IncidentTransition + perfil del usuario → Notification
```

**Genera notificación**:
- `incident.confirmed` — primera transición a `CONFIRMED`.
- `incident.escalated` — transición a `ESCALATING` o subida de `effectiveSeverity`.
- `incident.territorial_change` — cambio de `scope`/`regionCode`.
- `incident.resolved` — transición a `RESOLVED` (una sola vez, no repetida).
- `incident.action_recommended` — nueva entrada no trivial en `recommendedActions`.
- `alert.official` — nueva `IncidentEvidence` con `isOfficial: true` que eleva `verificationStatus → OFFICIAL`.

**Impide explícitamente** (corrige hallazgos de `ARGUS_DATA_FLOW.md` §5):
- Duplicación — el trigger es la *transición*, no cada evidencia individual adjuntada (hoy `buildArgusNotifications` no distingue esto y depende de un dedup heurístico por firma `tipo:lat:lng:bucket6h` que puede fallar).
- Notificar cada evidencia — solo las 6 transiciones listadas arriba generan notificación; adjuntar evidencia sin cambio de estado no notifica.
- Mezclar predicción y alerta oficial — `IncidentAssessment` (predicción) nunca dispara `alert.official`; solo evidencia con `isOfficial: true` lo hace.
- Contar resueltos como activos — `RESOLVED`/`ARCHIVED` quedan excluidos del contador de "activos" (§8.2).

---

## 16. Módulos como consumidores

| Módulo | Incidente | Evidencia | Assessment | Actions | Datos propios |
|---|---|---|---|---|---|
| ATLAS | Sí (contexto operativo general) | Sí | No | No | Registro de decisiones/auditoría propio |
| VIGÍA | Sí (es su dominio central) | Sí | No | No | — |
| ORÁCULO | Sí | Sí (verificación/fact-check) | No | No | — |
| TALOS | Sí | Sí (contexto) | Sí (es su producto) | Sí | — |
| HERMES | Sí | No | Sí (consume TALOS) | Sí (rutas/logística) | Rutas propias |
| ARCA | Sí (para disparar asignación) | No | No | Sí | Refugios (hoy 100% demo, fuera de alcance de esta tarea) |
| AURA | Opcional (contexto médico regional) | No | No | No | Puntos médicos propios (hoy 100% estático) |
| FÉNIX | Sí (gemelo digital predictivo) | Sí | Sí | Sí | Escenarios de simulación propios |
| CUSTOS | Sí | Sí | No | No | Auditoría (`IncidentTransition`/`AuditLog`) |
| NEXUS | Sin definir — hoy sin backend, no se fuerza consumo | — | — | — | — |
| VESTA | Opcional (contexto de riesgo regional) | No | No | No | Perfil de preparación propio (ya real, no tocar) |

No se obliga a ningún módulo a consumir todos los campos — el listado documenta lo mínimo razonable dado lo que ya se observó que cada módulo intenta hacer (§7 del informe de investigación de módulos).

---

## 17. API canónica (conceptual, no implementar aquí)

```text
GET /api/incidents                    — lista, con filtros: status, severity (effectiveSeverity),
                                          verificationStatus, type, countryCode/regionCode, since/until,
                                          bbox (solo para encuadre, nunca como filtro de geometría de alerta),
                                          isDemo (excluido por defecto salvo flag explícito)
GET /api/incidents/:id                — detalle completo
GET /api/incidents/:id/evidence       — paginado, filtrable por sourceType/isOfficial
GET /api/incidents/:id/history        — IncidentTransition ordenado
GET /api/incidents/:id/assessments    — IncidentAssessment relacionados
```

Permisos: lectura pública para `verificationStatus` ≥ `CORROBORATED` y `isDemo: false`; lectura autenticada para el resto (`CANDIDATE`/`UNVERIFIED`) con etiqueta explícita de estado — nunca se sirve un incidente no verificado sin esa etiqueta. Paginación cursor-based (ya usado en otros endpoints del repo). Respuestas públicas omiten `IncidentTransition.actorId`; respuestas institucionales lo incluyen bajo rol `OPERATOR`/`ADMIN`/`ANALYST`.

---

## 18. Eventos de dominio (conceptual)

```text
incident.detected      → auditoría, analytics
incident.correlated    → auditoría (nueva evidencia adjuntada a incidente existente)
incident.confirmed     → notificaciones, mapa
incident.escalated     → notificaciones, mapa, módulos suscritos (HERMES/ARCA)
incident.resolved      → notificaciones, mapa
incident.archived      → mapa (retiro), analytics
evidence.attached       → auditoría, analytics (nunca notificaciones directamente)
assessment.created      → módulos (TALOS→HERMES/ARCA), no notificaciones directas
action.recommended      → notificaciones (con throttling), módulos
```

No se implementa un event bus en esta tarea — se documenta como contrato para cuando la Fase D lo requiera; en el interín, cada transición puede invocarse como función directa (patrón ya usado por `sweepIncidentLifecycles`).

---

## 19. Testabilidad (criterios para fases futuras)

Obligatorios antes de conectar cualquier consumidor nuevo:
- Identidad: mismo `externalId` + mismo `sourceId` nunca crea un segundo `Incident`.
- Correlación: casos por categoría de §7.2 (sismo USGS+GDACS no se funde por bucket; incendio FIRMS+EFFIS sí se agrupa dentro de ventana).
- Deduplicación: evidencia repetida (mismo `externalId`) no duplica filas de `IncidentEvidence`.
- Lifecycle: cada transición de la tabla §8.1 tiene un caso que prueba condición de entrada y de salida.
- Severidad: `sourceSeverity` nunca se sobrescribe; `effectiveSeverity` respeta `severityOverride` cuando existe.
- Confianza: corroboración multi-fuente sube `confidenceScore` según la fórmula única; una sola fuente oficial basta para `CORROBORATED`.
- Geometría: `warningArea` nunca es un bbox; `displayBounds` nunca se usa como geometría de alerta.
- Trazabilidad: `IncidentTransition` se crea en cada cambio de estado/severidad, con `actorId` correcto (nulo si automático).
- Mapeo a `ArgusEvent`: snapshot test contra los outputs actuales de los tres mapeadores existentes, para detectar regresiones durante la migración.
- Notificaciones: cada uno de los 6 triggers de §15 genera exactamente una notificación; adjuntar evidencia sin transición no notifica.
- Compatibilidad con datos legacy: incidentes migrados desde `KnowledgeIncident` sin `canonicalKey` calculado se pueden leer sin error (retrocompatibilidad de lectura).
- Migración: doble escritura (Fase C) produce resultados idénticos entre el modelo viejo y el nuevo para una muestra de incidentes reales.

Casos de prueba mínimos por tipo de amenaza: sismo (USGS+GDACS+CSN concurrentes), incendio (FIRMS+EFFIS con geometría), alerta oficial SENAPRED con cancelación posterior, reporte ciudadano sin corroboración (debe quedar `UNVERIFIED`, nunca visible como oficial), tsunami con corrección de severidad tras la primera evidencia.

---

## 20. Observabilidad (conceptual)

```text
incidents_created            — por tipo de amenaza, por fuente
evidence_attached            — por incidente, por fuente
duplicates_detected          — vía IncidentRelation(duplicate_of)
incidents_merged             — vía IncidentTransition
incidents_split              — vía IncidentTransition (caso raro, requiere revisión manual)
lifecycle_transitions        — por estado origen/destino
classification_conflicts     — cuando dos fuentes reportan severidad muy distinta para la misma evidencia
source_disagreements         — cuando `sourceSeverity` diverge de `normalizedSeverity` más de un umbral
mapping_failures             — errores del mapeador único a ArgusEvent
notification_suppressed      — por regla de supresión (dedup, resuelto no cuenta, etc.)
```

Logs mínimos: cada `IncidentTransition` es en sí misma un log estructurado (no requiere sistema adicional). Alertas mínimas: tasa de `classification_conflicts` o `mapping_failures` por encima de umbral en una ventana de 15 min (frecuencia del cron existente) debería notificar al equipo, no a usuarios finales. No se implementan herramientas nuevas en esta tarea.

---

## 21. Decisiones obligatorias — respuestas explícitas

1. **¿`KnowledgeIncident` evoluciona o se reemplaza?** Evoluciona (Alternativa A, §4).
2. **¿`ArgusEvent` sigue siendo DTO?** Sí, con un único mapeador (§14).
3. **¿Qué ocurre con `ExternalEvent`?** Se retira una vez que el `Incident` canónico cubra sismos (su único consumidor real activo hoy es `/api/notifications`); antes de eso, se corrige el bug de `expiresAt` como mitigación de corto plazo independiente de esta migración (ver riesgos, §22). `ExternalEventCorrelation`, confirmado write-only, se retira sin reemplazo (su propósito lo asume `IncidentRelation`). `src/lib/ingest/*`, confirmado huérfano (0 importadores), se retira sin reemplazo.
4. **¿Cómo se integran `Report` y `HelpRequest`?** FK opcional `incidentId`, sin fusión de tablas (§13).
5. **¿Qué ocurre con `/api/incidents`?** Se re-apunta al `Incident` canónico solo cuando exista contenido real que mostrar; el modo sintético actual (`getCommandCenterIncidents`) se conserva como fallback explícito de demo, nunca implícito — no se elimina el mecanismo de `dataMode`/`isDemoDataAllowed()`, que ya es la mejor pieza de gobierno de datos demo del repo.
6. **¿Cuál es el lifecycle único?** El de §8.1 (11 estados, formalización de `IncidentLifecycle` existente + 5 estados nuevos).
7. **¿Cuál es la severidad única?** `INFO/LOW/MODERATE/HIGH/CRITICAL` en 4 dimensiones (§9).
8. **¿Cómo se representa confianza?** `confidenceScore` (0-100) + `confidenceLevel` (4 niveles) + `verificationStatus` (5 estados), separada de severidad (§10).
9. **¿Cómo se correlacionan fuentes?** Por categoría de amenaza, reglas de §7.2, formalizando lo ya implementado en `dedup.ts`/`firmsClusterer.ts`.
10. **¿Cómo se conectan los módulos?** Orden de §23 del plan de migración: mapa → notificaciones → ATLAS → VIGÍA → ORÁCULO → TALOS → resto.
11. **¿Qué modelo se retira primero?** `src/lib/ingest/*` (huérfano, cero riesgo) y `ExternalEventCorrelation` (write-only, cero riesgo) — ver Fase E del plan de migración.
12. **¿Qué cambio debe implementarse primero?** El mapeador único `canonicalIncidentToArgusEvent()` leyendo (temporalmente) desde `KnowledgeIncident` sin cambiar el esquema — elimina la peor duplicación activa (divergencia del fix GDACS) con el menor riesgo posible. Ver Fase A del plan de migración.

---

## 22. Riesgos

- **Pérdida de datos**: mitigado por no eliminar ninguna tabla hasta Fase E, y por preservar `sourceSeverity`/evidencia original sin sobrescritura en ningún paso.
- **Doble escritura**: necesaria en Fase C (transición de `KnowledgeIncident` a `Incident`); mitigada con comparación automática de resultados (mismo patrón sugerido para lectura dual) antes de cortar la escritura antigua.
- **Duplicación**: mitigada por `canonicalKey` persistido + reglas de correlación explícitas por categoría (§7.2), reemplazando el dedup heurístico actual de notificaciones.
- **Incompatibilidad**: los tres mapeadores actuales sirven de "oráculo" de regresión (snapshot tests, §19) durante toda la migración.
- **Rendimiento**: `sourceCount`/`evidenceCount` denormalizados en `Incident` evitan agregaciones repetidas; el sweep de lifecycle ya corre en lotes de concurrencia acotada (patrón a preservar).
- **Rollback**: cada fase del plan de migración (documento hermano) es individualmente reversible vía feature flag, sin requerir revertir una fase anterior.

---

## 23. Documentos de referencia inspeccionados

`prisma/schema.prisma`; `src/types/{argusEvent,crisis,incident,ingestion,knowledgeIntake,map,notificationCenter,conflictZone,riskAssessment}.ts`; `src/lib/vigia/*`; `src/lib/knowledge-intake/{incidentNormalizer,persistence/*,map/*}.ts`; `src/lib/ingestion/*`; `src/lib/ingest/*` (confirmado huérfano); `src/app/api/{argus,vigia,events,incidents,notifications,conflict-events,conflict-zones,external-events}/**`; `src/lib/command/incidentBuilder.ts`; `src/lib/notifications/notificationCenterEngine.ts`; `src/lib/modules/moduleAccess.ts`; `docs/audit/ARGUS_MASTER_AUDIT.md`, `ARGUS_SYSTEM_MAP.md`, `ARGUS_DATA_FLOW.md`, `ARGUS_TECHNICAL_DEBT.md`.
