# ARGUS — Matriz de Mapeo de Campos hacia la Entidad Canónica

**Fecha**: 2026-07-14
**Tipo**: matriz de referencia — **solo diseño, no implementar**.
**Documento hermano de**: `ARGUS_CANONICAL_INCIDENT_DESIGN.md` (decisiones y justificación de cada campo canónico), `ARGUS_CANONICAL_INCIDENT_DIAGRAMS.md`, `ARGUS_INCIDENT_MIGRATION_PLAN.md`.

Leyenda de riesgo: 🟢 bajo (transformación directa/aditiva) · 🟡 medio (requiere lógica de normalización o backfill) · 🔴 alto (pérdida potencial de información si se hace mal, o ambigüedad semántica a resolver a mano).

---

## 1. `KnowledgeIncident` → `Incident` / `IncidentEvidence`

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| `id` | KnowledgeIncident | `Incident.id` | Ninguna — se conserva | 🟢 |
| `externalId` | KnowledgeIncident | `IncidentEvidence.externalId` (de la evidencia primaria) | **Se mueve de nivel incidente a nivel evidencia** — un incidente puede tener varias evidencias con `externalId` distintos por fuente | 🟡 |
| `sourceId` / `sourceName` | KnowledgeIncident | `IncidentEvidence.sourceId` / `IncidentSource.name` | Se mueve a evidencia; `Incident` conserva `sourceCount` agregado | 🟡 |
| `title` | KnowledgeIncident | `Incident.title` | Directa | 🟢 |
| `summary` | KnowledgeIncident | `Incident.summary` | Directa | 🟢 |
| `domain` | KnowledgeIncident | `Incident.type` | Renombre directo | 🟢 |
| `subtype` | KnowledgeIncident | `Incident.subtype` | Directa | 🟢 |
| `severity` | KnowledgeIncident | `Incident.normalizedSeverity` (punto de partida) | Backfill: el valor actual se copia como `normalizedSeverity` inicial; `sourceSeverity` se reconstruye desde `IncidentEvidence.severityReported` si existe, o se marca `null` para datos históricos sin ese detalle | 🟡 |
| `confidenceScore` | KnowledgeIncident | `Incident.confidenceScore` | Directa (mismo rango 0-100) | 🟢 |
| `actionabilityScore` | KnowledgeIncident | `IncidentAssessment.probabilityScore` (si se usa) o se descarta | Confirmado sin consumidor activo claro fuera de scoring interno — evaluar en Fase C si tiene lectores reales antes de migrar o descartar | 🟡 |
| `sourceReliabilityScore` | KnowledgeIncident | `IncidentSource.reliabilityScore` | Se mueve a la entidad de fuente (ya existe en `KnowledgeSource`, se consolida) | 🟢 |
| `occurredAt` | KnowledgeIncident | `Incident.startedAt` | Renombre directo | 🟢 |
| `detectedAt` | KnowledgeIncident | `Incident.detectedAt` | Directa | 🟢 |
| `country` / `region` / `locality` | KnowledgeIncident | `Incident.countryCode` / `regionCode` / `locality` | Directa; código ISO/INE solo donde exista catálogo, string libre en el resto | 🟢 |
| `latitude` / `longitude` | KnowledgeIncident | `Incident.eventLocation` (`ArgusGeometry` tipo `point`) | Envolver en el contrato de geometría ya maduro de `ArgusEvent` | 🟢 |
| `geometryJson` | KnowledgeIncident | `Incident.affectedArea` / `warningArea` (según contenido) | **Requiere revisión manual por fuente**: hoy es JSON libre; para SENAPRED ya contiene polígonos administrativos reales (mapear a `administrative_area`), para otras fuentes puede estar vacío o ser un bbox (nunca debe mapearse a `warningArea`/`affectedArea` si es bbox — mapear a `displayBounds` o descartar) | 🔴 |
| `casualtiesJson` | KnowledgeIncident | `IncidentEvidence.metadataJson.casualties` | Se preserva sin cambio de forma, solo cambia de contenedor | 🟢 |
| `impactJson` | KnowledgeIncident | `IncidentAssessment.evidence` o `IncidentEvidence.metadataJson.impact` | Depende de si el contenido es evaluativo (→ Assessment) u observacional (→ Evidence); requiere inspección de contenido real antes de decidir por fuente | 🟡 |
| `technicalFactorsJson.lifecycle` | KnowledgeIncident | `Incident.status` | **La transformación central de toda la migración**: mapear los 6 valores actuales (`new/active/monitoring/contained/resolved/archived`) a los 11 estados canónicos — `new→DETECTED` o `ACTIVE` según si ya tiene corroboración, `active→ACTIVE`, `monitoring→MONITORING`, `contained→CONTAINED`, `resolved→RESOLVED`, `archived→ARCHIVED`. Los estados nuevos (`VALIDATING`, `CONFIRMED`, `ESCALATING`, `REJECTED`, `DUPLICATE`) no tienen equivalente histórico — se infieren solo hacia adelante, nunca por backfill retroactivo | 🔴 |
| `technicalFactorsJson.lifecycleUpdatedAt` | KnowledgeIncident | Se reemplaza por `IncidentTransition.createdAt` de la transición más reciente | El valor histórico se pierde como transición individual (no hay historial de transiciones previas, solo el estado actual) — aceptable porque es exactamente la limitación que la migración corrige hacia adelante | 🟡 |
| `causesJson` | KnowledgeIncident | `IncidentRelation` (kind: `caused_by`) si referencia otro incidente; si no, `IncidentEvidence.metadataJson` | Requiere inspección: si el campo contiene IDs de otros incidentes, se modela como relación; si es texto libre, queda como metadato | 🟡 |
| `contributingFactorsJson` | KnowledgeIncident | `IncidentEvidence.metadataJson.contributingFactors` | Directa, sin pérdida | 🟢 |
| `responseActionsJson` | KnowledgeIncident | `Incident.recommendedActions` (array) | Directa si ya es array; normalizar forma si es texto libre | 🟢 |
| `lessonsLearnedJson` | KnowledgeIncident | Permanece en `KnowledgeLesson` (tabla ya dedicada, fuera de alcance de esta migración) | Sin cambio — `KnowledgeLesson` ya tiene FK `incidentId` opcional | 🟢 |
| `recommendedActionsJson` | KnowledgeIncident | `Incident.recommendedActions` | Fusionar con `responseActionsJson` si ambos están poblados para el mismo incidente — requiere regla de precedencia a definir en implementación | 🟡 |
| `relatedHistoricalEventsJson` / `similarIncidentIdsJson` | KnowledgeIncident | `IncidentRelation` (kind: `related_to`) | Si contienen IDs válidos de otros `KnowledgeIncident`, se convierten en filas `IncidentRelation`; si son referencias a `HazardKnowledgeFact` (eventos históricos, no incidentes activos), permanecen como están — son conceptos distintos | 🟡 |
| `tagsJson` | KnowledgeIncident | `Incident.tags` | Directa | 🟢 |
| `language` | KnowledgeIncident | `IncidentEvidence.metadataJson.language` | Se mueve a nivel de evidencia (el idioma es propiedad de la fuente, no del hecho) | 🟢 |
| `rawEvidenceRefsJson` | KnowledgeIncident | `IncidentEvidence.rawPayloadReference` | Ya casi directo — formalizar como referencia/hash según política de §12 del diseño | 🟢 |
| `reviewStatus` | KnowledgeIncident | `Incident.verificationStatus` | Mapeo: `auto_accepted→CORROBORATED` (si multi-fuente) u `OFFICIAL` (si fuente única oficial), `needs_more_evidence→UNVERIFIED`, `pending_review→CANDIDATE`. **Ojo**: el campo actual nunca transiciona tras la creación (confirmado en la inspección), así que el backfill reflejará el estado de creación, no el estado real actual — requiere recomputar `verificationStatus` desde cero con las reglas de §10 del diseño, no copiar el valor tal cual | 🔴 |
| `createdAt` / `updatedAt` | KnowledgeIncident | `Incident.createdAt` / `updatedAt` | Directa | 🟢 |
| *(sin equivalente hoy)* | — | `Incident.canonicalKey` | **Campo nuevo** — se calcula retroactivamente aplicando `buildGlobalDedupKey()` (ya existe como función, nunca se persistió su resultado) sobre los datos históricos | 🟡 |
| *(sin equivalente hoy)* | — | `Incident.sourceCount` / `evidenceCount` | **Campos nuevos** — se calculan por `COUNT` una vez en el backfill, luego se mantienen incrementalmente | 🟢 |
| *(sin equivalente hoy)* | — | `Incident.isOfficial` | **Campo nuevo** — se deriva de si `sourceId` pertenece a una fuente con `officialSource: true` en `KnowledgeSource` | 🟢 |

### 1.1 `KnowledgeEvidence` → `IncidentEvidence`

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| `id`, `incidentId`, `sourceId`, `sourceName`, `evidenceType`, `title`, `url`, `excerpt`, `rawRef`, `confidenceScore`, `metadataJson`, `createdAt` | KnowledgeEvidence | Campos homónimos en `IncidentEvidence` | Ninguna — la tabla evoluciona in-place, es prácticamente el mismo contrato | 🟢 |
| *(sin equivalente hoy)* | — | `IncidentEvidence.externalId` | Ver arriba — se puebla desde `KnowledgeIncident.externalId` para la evidencia primaria de incidentes existentes | 🟡 |
| *(sin equivalente hoy)* | — | `publishedAt` / `observedAt` / `receivedAt` | Backfill: `receivedAt = createdAt` (aproximación razonable); `publishedAt`/`observedAt` quedan `null` para datos históricos, se popula solo hacia adelante | 🟡 |
| *(sin equivalente hoy)* | — | `isPrimary` / `isOfficial` | Backfill: `isPrimary = true` para la primera evidencia por incidente por orden de `createdAt`; `isOfficial` derivado de `IncidentSource.officialSource` | 🟢 |

---

## 2. `Report` → `IncidentEvidence` (correlacionada) + FK `incidentId`

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| `id`, `userId` | Report | Se conservan en `Report` (no se fusiona la tabla) | Sin cambio — `Report` sigue siendo la fuente de verdad de moderación/trust score | 🟢 |
| `category` | Report | `IncidentEvidence.evidenceType` (`"citizen_report"`) + `Incident.type` si genera incidente nuevo | Mapeo de categorías de reporte a `Incident.type` requiere tabla de correspondencia (p. ej. `"incendio"→WILDFIRE`) — a definir en implementación | 🟡 |
| `title` / `description` | Report | `IncidentEvidence.title` / `excerpt` | Directa | 🟢 |
| `latitude` / `longitude` | Report | `IncidentEvidence.geometry` (point) | Envolver en `ArgusGeometry` | 🟢 |
| `locationText` | Report | `IncidentEvidence.metadataJson.locationText` | Directa | 🟢 |
| `severity` | Report | `IncidentEvidence.severityReported` | Directa — se preserva como severidad reportada, nunca se usa directo como `effectiveSeverity` de un `Incident` (mandato: reporte ciudadano nunca alcanza `OFFICIAL` sin corroboración) | 🟢 |
| `status` | Report | Permanece en `Report.status` (lifecycle de moderación, dominio distinto del lifecycle de `Incident`) | Sin cambio — son dos máquinas de estado independientes por diseño (§13 del diseño) | 🟢 |
| `aiSummary` / `aiRecommendation` / `aiConfidence` | Report | `IncidentEvidence.metadataJson.ai*` si se adjunta como evidencia | Se preserva como metadato, no como campo de primera clase del incidente | 🟢 |
| `falseReportRisk` | Report | Permanece en `Report` — es una señal de moderación de la fuente, no del incidente | Sin cambio | 🟢 |
| *(sin equivalente hoy)* | — | `Report.incidentId` (nuevo, nullable) | **Campo nuevo en Fase C** — se puebla hacia adelante mediante las reglas de correlación de §7.2 del diseño; backfill retroactivo opcional y de bajo riesgo por ser nullable | 🟡 |

---

## 3. `HelpRequest` → correlación opcional (nunca evidencia automática de incidente)

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| `id`, `userId`, `category`, `title`, `description`, `latitude`, `longitude`, `locationText` | HelpRequest | Permanecen en `HelpRequest` | Sin cambio — nunca se fusiona ni se convierte automáticamente en `IncidentEvidence` (mandato §15: "no convierta toda solicitud de ayuda en incidente") | 🟢 |
| `priority` | HelpRequest | No se mapea a severidad de incidente | Permanece como campo propio de asignación operativa de la solicitud, dominio distinto de `Incident.effectiveSeverity` | 🟢 |
| `status`, `restrictedMode` | HelpRequest | Permanecen en `HelpRequest` | Sin cambio | 🟢 |
| *(sin equivalente hoy)* | — | `HelpRequest.incidentId` (nuevo, nullable) | **Campo nuevo en Fase C** — se puebla solo cuando la solicitud cae dentro de la ventana espacio-temporal de un `Incident` existente (nunca crea uno nuevo) | 🟡 |

---

## 4. `ExternalEvent` → retiro planificado (sismos absorbidos por `Incident`)

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| `id`, `sourceId`, `externalId` | ExternalEvent | `IncidentEvidence.id` / `sourceId` / `externalId` | Directa, si se decide migrar el histórico; alternativa de menor riesgo es no migrar y dejar que `Incident` capture sismos nuevos desde su propia ingesta, archivando `ExternalEvent` tal cual para consulta histórica | 🟡 |
| `category` | ExternalEvent | `Incident.type` | Requiere tabla de correspondencia con la taxonomía de `ArgusEventType` | 🟡 |
| `title` / `description` | ExternalEvent | `IncidentEvidence.title` / `excerpt` | Directa | 🟢 |
| `severity` | ExternalEvent | `IncidentEvidence.severityReported` | Directa | 🟢 |
| `confidence` | ExternalEvent | `IncidentEvidence.confidenceScore` | Requiere normalizar escala si no es 0-100 | 🟡 |
| `latitude` / `longitude` / `locationName` / `country` | ExternalEvent | `IncidentEvidence.geometry` / `Incident.countryCode` | Directa | 🟢 |
| `sourceUrl` | ExternalEvent | `IncidentEvidence.url` (vía `IncidentSource`) | Directa | 🟢 |
| `occurredAt` / `fetchedAt` / `lastSeenAt` | ExternalEvent | `IncidentEvidence.observedAt` / `receivedAt` / metadato | Directa con ligera pérdida de granularidad (3 timestamps → 2) | 🟡 |
| `expiresAt` | ExternalEvent | `Incident.expiresAt` | **Se corrige el defecto**: en el modelo canónico este campo sí se filtra obligatoriamente en toda query de lectura (a diferencia de hoy, confirmado como campo muerto) | 🟢 (la corrección en sí es de bajo riesgo; el riesgo real es no corregirlo, ya documentado como hallazgo P0-adyacente) |
| `raw` / `normalized` | ExternalEvent | `IncidentEvidence.metadataJson` / `rawPayloadReference` | Directa, sujeta a la política de payload de §12 del diseño (hash+referencia para fuentes de alto volumen) | 🟢 |
| `ExternalEventCorrelation` (tabla completa) | ExternalEvent | `IncidentRelation` | La tabla es write-only hoy (confirmado sin lectores) — se retira sin migrar datos, ya que nada depende de su contenido histórico | 🟢 |

**Nota de alcance**: `ExternalEvent` no se elimina en el mismo movimiento que se crea `Incident` — permanece como tabla de solo lectura/archivo hasta que Fase D confirme que sismos vía `Incident` cubren el caso de uso real (notificaciones), y solo entonces se retira según los criterios de Fase E del plan de migración.

---

## 5. `Incident` / `IncidentCommandView` (sintético) → sin migración de datos

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| Todos los campos de `src/types/incident.ts` | Incident (sintético, en memoria) | **Ninguno** — no hay datos reales que migrar | No aplica migración de datos; el tipo TS puede renombrarse (p. ej. `IncidentCommandView` conserva su nombre como vista de UI del Command Center, pero deja de ser la definición canónica del dominio) para no colisionar con el nuevo `Incident` canónico | 🟡 (riesgo de nombre, no de dato) |
| `dataMode` / `isDemo` / `persistent: false` | Incident (sintético) | `Incident.isDemo` / `isSynthetic` (canónico) | El patrón conceptual se preserva y se generaliza — es el único mecanismo de este subsistema que vale la pena llevar al canónico | 🟢 |

**Nota**: dado que este modelo es 100% sintético y sin persistencia (confirmado por inspección), no existe "backfill" — su rol pasa a ser exclusivamente el de fallback de demostración (`getCommandCenterIncidents()`) cuando `Incident` canónico no tiene datos reales que mostrar, gateado por `isDemoDataAllowed()` como ya ocurre hoy.

---

## 6. `ConflictZone` / `ConflictEvent` → sin fusión, correlación opcional futura

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| Todos los campos de `src/types/conflictZone.ts` | ConflictZone/ConflictEvent (estático) | **Ninguno directo** — permanecen como capa geopolítica independiente | Fuera de alcance de esta migración; son datos curados a mano, no un pipeline a unificar | 🟢 |
| `ConflictEvent.relatedZoneId` | ConflictEvent | Sin cambio | Vínculo interno propio, no se convierte en `IncidentRelation` salvo que en el futuro se decida ingerir conflicto desde fuentes vivas (GDELT/ReliefWeb, hoy sin wiring real pese a existir los adaptadores) | 🟢 |

---

## 7. `RiskAssessment` → `IncidentAssessment`

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| `id`, `riskType`, `status`, `probabilityBand`, `probabilityScore`, `confidence`, `severity`, `title`, `summary`, `recommendedAction`, `timeframe`, `evidence`, `nextReviewAt`, `metadata` | RiskAssessment | Campos homónimos en `IncidentAssessment` | Ninguna — la tabla evoluciona in-place, mismo contrato | 🟢 |
| `relatedExternalEventIds` (Json array de IDs) | RiskAssessment | `IncidentAssessment.incidentId` (FK real) | **Confirmado como correlación real y activamente consultada** (no un blob muerto) — se reemplaza el array Json por una FK directa; requiere resolver, para cada assessment existente, a qué `Incident` corresponde cada `ExternalEvent`/`Report` id listado (posible ambigüedad si el array tenía múltiples IDs de incidentes distintos, caso a revisar manualmente) | 🔴 |
| `RiskAssessmentRevision` (tabla completa) | RiskAssessment | Se conserva el patrón, opcionalmente renombrado `IncidentAssessmentRevision` | El patrón (campos antes/después + `reason`) es exactamente el que se reutiliza para `IncidentTransition` — se puede mantener como tabla separada específica de assessments o fusionar, decisión de implementación sin impacto conceptual | 🟢 |

---

## 8. `ArgusEvent` (DTO) → confirmado como proyección, no requiere migración de datos

| Campo actual | Modelo actual | Campo canónico | Transformación | Riesgo |
|---|---|---|---|---|
| Todos los campos de `src/types/argusEvent.ts` | ArgusEvent (DTO, sin tabla) | Ver tabla de derivación completa en `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §14 | El contrato **no cambia** — se convierte en el contrato de salida oficial del mapeador único, generado desde `Incident` en vez de desde `KnowledgeIncident` directamente | 🟢 |

---

## 9. Taxonomías paralelas a consolidar (transversal, no ligado a un solo modelo)

| Concepto disperso hoy | Ubicaciones confirmadas | Campo canónico único | Riesgo |
|---|---|---|---|
| Severidad | `ArgusIncidentSeverity` (knowledge-intake), `ArgusSeverity` (argusEvent), `severity` string libre (Report/HelpRequest/ExternalEvent/ConflictZone/RiskAssessment), 3+ clasificadores de código (`threatClassifier.ts`, `gdacsSeverity.ts`, `severeWeatherClassifier.ts`) | `Incident.{sourceSeverity,normalizedSeverity,assessedSeverity,effectiveSeverity}` (§9 del diseño) | 🔴 — es la taxonomía con más divergencia activa confirmada (bug GDACS v1.0.3.2 propagado a solo uno de dos mapeadores) |
| Confianza | `confidenceScore` (KnowledgeIncident), `ArgusConfidence` (argusEvent, 5 niveles), `aiConfidence` (Report/HelpRequest), `confidence` (RiskAssessment/ConflictZone/ExternalEvent), 2 fórmulas de cálculo distintas | `Incident.confidenceScore` + `confidenceLevel` (§10 del diseño) | 🟡 |
| Lifecycle/estado | `technicalFactorsJson.lifecycle` (6 valores), tags `lifecycle:*` de texto (SENAPRED), `ArgusEventStatus` (7 valores), `Report.status`/`HelpRequest.status` (dominios de moderación distintos, no fusionar), `IncidentDataMode`/`status` sintético | `Incident.status` (11 estados, §8 del diseño) | 🔴 — requiere backfill cuidadoso, ver fila `technicalFactorsJson.lifecycle` en §1 |
| Registro de fuentes | `src/lib/vigia/sourceRegistry.ts`, `src/lib/knowledge-intake/sourceRegistry.ts`, tabla `KnowledgeSource` | `IncidentSource` (consolidado sobre `KnowledgeSource`) | 🟡 |
| Geometría | `latitude/longitude` planos (múltiples modelos), `geometryJson` libre (KnowledgeIncident), `ArgusGeometry` discriminated union (ya maduro) | `Incident.{eventLocation,affectedArea,warningArea,displayBounds}` usando `ArgusGeometry` (§11 del diseño) | 🔴 en la migración de `geometryJson` libre específicamente (puede contener bboxes mal etiquetados como geometría de alerta) |

---

## 10. Campos explícitamente descartados (sin campo canónico, y por qué)

| Campo | Modelo | Motivo de no migrar |
|---|---|---|
| `KnowledgeIncident.reviewStatus` (valor literal) | KnowledgeIncident | Confirmado write-once, nunca transiciona — se recalcula desde cero como `verificationStatus`, no se copia (ver fila 🔴 en §1) |
| `technicalFactorsJson.lifecycleUpdatedAt` (histórico) | KnowledgeIncident | Solo captura la última transición, no el historial — se reemplaza por `IncidentTransition` desde el momento de activación en adelante, sin reconstrucción retroactiva del historial completo |
| `RESTRICTED_REPORT_STATUS` (constante mal ubicada en `reports/route.ts`) | Código, no modelo | Confirmado que en realidad filtra `User.accountStatus`, no `Report.status` — no es un campo de incidente, se documenta aquí solo para que no se confunda con lifecycle durante la implementación |
| `src/lib/ingest/*` (tipos completos) | Código huérfano | Cero importadores confirmados — no hay campo que preservar, se retira sin mapeo (Fase E del plan de migración) |
