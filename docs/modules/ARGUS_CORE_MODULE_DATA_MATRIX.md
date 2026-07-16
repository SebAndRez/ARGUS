# ARGUS — Matriz de Datos por Módulo (ATLAS / VIGÍA / ORÁCULO / TALOS)

**Fecha**: 2026-07-15
**Documento hermano de**: `docs/modules/ARGUS_CORE_MODULE_INTEGRATION.md`.

Todos los campos listados provienen de `ModuleIncidentSummary` (`src/types/moduleOperationalContext.ts`), servido por `/api/modules/incidents` (lista) y `/api/modules/incidents/[id]` (detalle) — la misma fuente para los cuatro módulos. "Fuente" indica de dónde viene el valor dentro del gateway (`canonicalIncidentGateway.ts`), no la fuente externa original (SENAPRED/USGS/etc., ya documentada en `ARGUS_SOURCE_OPERATIONS_BASELINE.md`).

| Campo | ATLAS | VIGÍA | ORÁCULO | TALOS | Fuente |
|---|---|---|---|---|---|
| `id` | KPIs + selección | Lista + detalle + navegación | Selección + `basedOnIncidentId` | Selección + `incidentId` | `KnowledgeIncident.id` (crudo) |
| `type` | — (agregado en KPI de países, no por tipo) | Lista + detalle | Lista | Lista + mapeo a `TalosEventCategory` | `ArgusEvent.eventType` |
| `title` | — | Lista + detalle | Lista (implícito vía panel compartido) | Lista + `TalosAssessmentEventInput.title` | `ArgusEvent.title` |
| `summary` | — | — (no mostrado en el panel compartido hoy) | — | — | `ArgusEvent.operationalSummary` |
| `severity` | KPI "Críticos activos" | Badge en lista/detalle | — (no usado por el análisis de reliability) | `TalosAssessmentEventInput.severity` → factor de riesgo | `ArgusEvent.severity` (Prompt 8/9, sin recalcular) |
| `lifecycle` | — (ya excluido por el gateway si es terminal) | Detalle | — | `TalosAssessmentEventInput.status` | `ArgusEvent.status` (Prompt 9/10, sin recalcular) |
| `verificationStatus` | KPI "Confirmados"/"Candidatos" | Detalle (etiqueta traducida) | Base del texto de `oraculoCanonicalAnalysis` | — (no usado directamente por TALOS) | Derivado en el gateway (§3.3 del doc de integración) |
| `confidence` | — | Detalle | Base numérica de `analysis.confidence` (0-100) | `assessment.confidence` (vía el propio motor TALOS, no directamente de `ModuleIncidentSummary`) | `ArgusEvent.confidence` (Prompt 9) |
| `location.latitude/longitude` | Mapa/KPI de países (via `countryCode`) | Detalle | — | Geometría real de entrada al motor de riesgo | `KnowledgeIncident.latitude/longitude` |
| `location.geometry` | — | — (el mapa general de ATLAS/VIGÍA no consume esta geometría todavía — usa su propio `CrisisEvent`/mapa operacional existente) | — | — | `ArgusEvent.geometry` (Prompt 9, nunca bbox) |
| `location.countryCode` | KPI "Países afectados" | Lista/detalle | — | `TalosAssessmentEventInput.location.label` (fallback) | `KnowledgeIncident.country` |
| `location.regionCode` | — | — | — | `TalosAssessmentEventInput.location.label` | `KnowledgeIncident.region` |
| `timing.startedAt` | — | — | — | `TalosAssessmentEventInput.createdAt` | `ArgusEvent.validFrom` |
| `timing.updatedAt` | — | Detalle ("Actualizado") | — | `TalosAssessmentEventInput.updatedAt` | `ArgusEvent.lastUpdated` |
| `timing.expiresAt` | — (ya usado internamente por el filtro de vigencia) | — | — | — | `ArgusEvent.validUntil` |
| `sourceSummary.primarySource` | — | Lista/detalle | `analysis.summary` (texto) | — | `ArgusEvent.attribution` |
| `sourceSummary.sourceCount` | — | Lista/detalle | `analysis.basedOnEvidenceCount` | — | `ArgusEvent.sources.length` |
| `sourceSummary.isOfficial` | — | Detalle ("¿Oficial?") | — (implícito en el texto de verificación) | — | `ArgusEvent.sourceType === "official"` |
| `isDemo` | — (el gateway ya excluye demo salvo permiso explícito) | Badge "Demo" en la lista | — | — | `ArgusEvent.isDemo` |

## Campos NO expuestos a ningún módulo (deliberadamente)

| Campo | Razón |
|---|---|
| Payload crudo (`technicalFactorsJson`, `casualtiesJson`, `impactJson`) | Prompt 17 §12: "no exponga payloads completos ni datos sensibles" — el contrato `ModuleIncidentSummary` es un subconjunto deliberado, no el modelo Prisma completo |
| `externalId` por fuente individual | No incluido en `ModuleIncidentSummary` en esta fase — candidato a campo futuro si algún módulo necesita mostrar external IDs por fuente (Prompt 17 §12 lo menciona como deseable para el detalle de VIGÍA; se dejó fuera por mantener el contrato mínimo, Prompt 17 §7: "no copie todo el modelo Prisma") |
| `HelpRequest.phone`/dirección exacta/notas médicas | Nunca llegan a ningún módulo — ni siquiera existen en `ModuleIncidentSummary` (el gateway solo lee `KnowledgeIncident`, no `HelpRequest`); la capa ciudadana de cada módulo (`Report`/`HelpRequest` vía `/api/events`) ya sanitiza estos campos independientemente de esta tarea |
