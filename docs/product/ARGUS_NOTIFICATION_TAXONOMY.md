# ARGUS — Taxonomía Canónica de Notificaciones

**Fecha**: 2026-07-14
**Tipo**: especificación de producto — clasificación, prioridad y presentación de `/api/notifications`.
**Alcance de esta tarea**: no se modificó Prisma, no se crearon migraciones, no se cambió el lifecycle persistido, no se modificaron fuentes/adaptadores/cron, no se hizo commit ni push.
**Documentos relacionados**: `docs/architecture/ARGUS_CANONICAL_INCIDENT_DESIGN.md` (§10.2, §15 — verificación y notificaciones como proyección), `docs/architecture/ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md`, `docs/architecture/ARGUS_OPERATIONAL_LIFECYCLE_POLICY.md`.

---

## 1. Problema que corrige

`/api/notifications` combina alertas oficiales, incidentes confirmados, reportes ciudadanos, eventos externos, análisis ARGUS, predicciones, candidatos no verificados, salud de fuentes, recordatorios VESTA y datos demo. Antes de esta tarea, parte de esa clasificación se calculaba en el servidor (`notificationCategory()` en `src/app/api/notifications/route.ts`, 3 valores: `official`/`argus_analysis`/`candidate`) pero **nunca se serializaba al cliente** — la UI no podía distinguir una predicción de una alerta oficial salvo por inferencia de texto/color.

Esta tarea introduce una taxonomía canónica de 11 categorías, la serializa explícitamente en cada `ArgusNotification`, y separa esa categoría de `severity` (qué tan grave) y `verificationStatus` (qué tan corroborado) — tres dimensiones que antes se mezclaban parcialmente.

---

## 2. Las tres dimensiones

```text
category            → qué es (Notification Category, 11 valores canónicos)
severity             → qué tan grave (P0_CRITICAL…P4_INFO, sin cambios)
verificationStatus   → qué tan corroborado (unverified…official, 6 valores)
```

Ninguna de las tres se deriva de las otras. Una predicción puede ser `P0_CRITICAL` sin ser jamás `official_alert`; un reporte ciudadano validado puede ser `corroborated` sin llegar nunca a `official`.

---

## 3. Categorías canónicas

| Categoría | Significado | Fuentes permitidas | Verificación típica | Contador operativo* | Badge |
|---|---|---|---|---|---|
| `official_alert` | Alerta emitida por una autoridad/fuente oficial reconocida, vigente | SENAPRED, USGS, GDACS, NWS, NOAA tsunami/storm, WHO DON, Smithsonian GVP, USGS volcano (`OFFICIAL_KNOWLEDGE_SOURCES`); `ExternalEvent` de USGS/NOAA tsunami/NWS | `official` | Sí | "Alerta oficial" |
| `confirmed_incident` | Incidente corroborado por una o más fuentes abiertas/técnicas, sin constituir alerta oficial formal | FIRMS, EFFIS, Copernicus EMS; `ExternalEvent` open-data; eventos de conflicto vía feed (no curados a mano) | `corroborated` | Sí | "Confirmado" |
| `candidate_signal` | Señal preliminar, pendiente de validación | `KnowledgeIncident` de una fuente no reconocida en el allowlist oficial/open-data; entradas curadas a mano de ATLAS (`rawProvider: "manual_curated"`) | `candidate` | No | "Candidato" |
| `citizen_report` | Reporte ciudadano o solicitud de ayuda | `Report`, `HelpRequest` | `unverified`→`corroborated` según `status` | No | "Reporte ciudadano" |
| `argus_analysis` | Interpretación producida por ARGUS sobre evidencia existente | (reservado — ver §7, no implementado como motor nuevo en esta tarea) | — | No | "Análisis ARGUS" |
| `prediction` | Modelo, escenario o proyección (TALOS/FÉNIX/predictive-core) | `getPredictiveNotificationPackets` | `model_generated` | No | "Predicción ARGUS" |
| `recommendation` | Orientación operacional ligada a un incidente (reservado) | — | — | No | "Recomendación ARGUS" |
| `source_health` | Estado técnico de una fuente de ingesta de ARGUS | Registro interno de fuentes | n/a (`undefined`) | No | "Sistema" |
| `preparedness_reminder` | Recordatorio de preparación personal VESTA | `PreparednessReminder` | n/a (`undefined`) | No | "Recordatorio" |
| `system_notice` | Aviso operativo no ligado a una amenaza externa (p. ej. rutas) | Rutas ARGUS | n/a (`undefined`) | No | "Sistema" |
| `demo` | Contenido de demostración/placeholder | Cualquier fuente marcada demo-like | n/a (`undefined`) | No | "Demo" |

\* "Contador operativo" = cuenta hacia `summary.critical`/`summary.high` cuando además `severity` coincide y el `status` está vigente (no `RESOLVED`/`DISMISSED`).

`argus_analysis` y `recommendation` quedan reservadas en la taxonomía (tipos y prioridad ya definidos) para cuando exista un motor de análisis/recomendación propio — el Prompt 11 prohíbe explícitamente implementarlo en esta tarea (§17: "No implemente todavía un motor nuevo de recomendaciones").

---

## 4. Estado de verificación (`VerificationStatus`)

```text
unverified → candidate → corroborated → official
model_generated   (predicciones — dimensión aparte, nunca sube a official)
rejected          (terminal, alcanzable desde cualquier estado)
```

| Origen | Verificación |
|---|---|
| SENAPRED, USGS, GDACS, NWS, etc. (`official_alert`) | `official` |
| FIRMS/EFFIS/EMS, `ExternalEvent` open-data, conflicto vía feed | `corroborated` |
| `KnowledgeIncident` de fuente no reconocida | `candidate` |
| Reporte ciudadano nuevo (`NEW`/`UNDER_REVIEW`/`RECEIVED`) | `unverified` |
| Reporte ciudadano validado/escalado/resuelto/asignado | `corroborated` |
| Reporte ciudadano descartado/cancelado | `rejected` |
| Predicción ARGUS | `model_generated` |
| Source health, recordatorio, sistema, demo | ausente (`undefined`) — no se fuerza un valor placeholder |

La severidad nunca eleva verificación: una predicción `P0_CRITICAL` sigue siendo `model_generated`, nunca `official`.

---

## 5. Prioridad de la campana

Orden aplicado en `categoryPriorityRank()` (`src/lib/notifications/notificationCenterEngine.ts`), usado por `dedupeOperationalNotifications`/`prioritizeGlobalWatchNotifications`:

```text
0  official_alert   + P0_CRITICAL
1  confirmed_incident + P0_CRITICAL
2  official_alert   + P1_HIGH
3  confirmed_incident + P1_HIGH
4  official_alert / confirmed_incident (otra severidad)
5  candidate_signal
6  recommendation
7  argus_analysis
8  prediction
9  citizen_report
10 preparedness_reminder
11 source_health / system_notice
12 demo
```

Dentro del mismo rango, `notificationOrderTier()` sigue decidiendo por lifecycle/severidad (un `RESOLVED`/`DISMISSED` nunca supera a uno vigente), y finalmente por `eventTime` descendente. Una predicción crítica **nunca** supera a una alerta oficial de severidad menor — la categoría gana sobre la severidad a partir del rango 5.

---

## 6. Contador operativo (`summary.critical` / `summary.high`)

Solo suman:

- `category` ∈ {`official_alert`, `confirmed_incident`}
- `severity` = `P0_CRITICAL` (para `critical`) o `P1_HIGH` (para `high`)
- lifecycle vigente (`classifyLifecycleVisibility(status).visible`, excluye `RESOLVED`/`DISMISSED`/`ARCHIVED`/etc.)

Nunca suman, sin importar la severidad almacenada: `prediction`, `argus_analysis`, `recommendation`, `candidate_signal`, `citizen_report`, `preparedness_reminder`, `source_health`, `demo`. Esto corrige el caso "predicción crítica ≠ alerta oficial crítica" (Prompt 11 §11) y preserva la corrección previa de la Prompt 10 (un incidente resuelto no sigue contando como activo).

`summary.total`/`summary.unread`/`summary.local`/`summary.national`/`summary.international`/`summary.global` no aplican este filtro — una notificación de cualquier categoría puede seguir apareciendo en el feed general.

---

## 7. Serialización

`/api/notifications` serializa, en cada notificación:

```text
category               — siempre presente
verificationStatus      — presente cuando aplica conceptualmente
isOfficial               — siempre presente (boolean)
severity, status, sourceType, scope  — sin cambios (legacy, ver §9)
```

`summary.byCategory` (`Record<NotificationCategory, number>`) reemplaza el antiguo `buildCategorySummary()` de 3 valores calculado solo en `route.ts` — ahora forma parte de `buildNotificationSummary()` en `notificationCenterEngine.ts`, la misma función que calcula `critical`/`high`/`total`, así que ambos números nunca pueden divergir entre sí.

El cliente (`NotificationCenterPanel.tsx`, `NotificationItem.tsx`) lee `category`/`verificationStatus` directamente — ya no infiere nada de título, ícono, color o `sourceName`.

---

## 8. Presentación visual

Regla aplicada (`src/lib/notifications/notificationVisuals.ts`, `NotificationItem.tsx`):

```text
color              = severidad   (ya existente, sin cambios)
badge/texto        = categoría   (notificationCategoryLabels, siempre texto)
borde secundario   = verificación (verificationStatusLabels, solo si está presente)
```

Cada categoría tiene una etiqueta de texto propia y una clase de borde distinta — ninguna etiqueta se comparte entre categorías distintas, y ninguna depende únicamente de color (Prompt 11 §14-§15). No se rediseñó la campana: los badges de severidad/scope/status existentes se mantienen; solo se agregó el badge de categoría y el indicador de verificación.

---

## 9. Compatibilidad con campos legacy

`sourceType` (`OFFICIAL`/`OPEN_DATA`/`CITIZEN`/`ARGUS_ESTIMATE`/`INSTITUTIONAL`/`SYSTEM`) y `status` (`NEW`/`UPDATED`/`MONITORING`/`RESOLVED`/`DISMISSED`) se mantienen sin cambios — antes eran la única señal disponible para inferir clasificación (por ejemplo, el `notificationCategory()` retirado de `route.ts` leía `sourceType`/`id.startsWith(...)`). Siguen sirviendo su propósito original (procedencia técnica y estado de lifecycle respectivamente) pero **ya no son la fuente primaria de clasificación** — eso ahora es `category`. Ningún consumidor debe volver a inferir categoría desde `sourceType`; no se retiran estos campos porque otros consumidores (mapa, filtros existentes) siguen leyéndolos para su propósito original.

No se creó una segunda taxonomía paralela: el `?category=` de `/api/notifications` ahora acepta directamente los 11 valores canónicos (antes aceptaba los 3 valores efímeros no documentados de `route.ts`).

---

## 10. Reglas de demo y predicción (resumen)

- **Demo**: cualquier notificación detectada como demo-like (`canonicalizeDemoLikeNotification`) se degrada a `category: "demo"`, `isOfficial: false`, `verificationStatus: undefined` — sin importar qué categoría le habría asignado su builder de origen. Nunca ocupa un slot operativo ni cuenta como crítico. Excluida por completo cuando `isDemoDataAllowed()` es `false` (producción sin `ARGUS_ALLOW_DEMO_DATA=true`).
- **Predicción**: siempre `category: "prediction"`, `verificationStatus: "model_generated"`, `isOfficial: false` — la severidad (incluso `P0_CRITICAL`) y que el análisis subyacente alcance `confirmed_by_official_source` (que solo afecta `status`) nunca la promueven a `official_alert`.

---

## 11. Archivos relevantes

```text
src/types/notificationCenter.ts                    — NotificationCategory, VerificationStatus, campos nuevos de ArgusNotification/Summary
src/lib/notifications/notificationCenterEngine.ts   — clasificación por builder, prioridad, dedupe, slots, resumen compartido
src/lib/notifications/notificationVisuals.ts        — etiquetas y clases de badge de categoría/verificación
src/app/api/notifications/route.ts                  — filtro ?category=, orquestación
src/components/notifications/NotificationItem.tsx   — badges de categoría/verificación
src/components/notifications/NotificationCenterPanel.tsx — resumen consolidado (sin duplicar buildNotificationSummary)
tests/notifications/notificationTaxonomy.test.ts    — casos de taxonomía/prioridad/contadores (motor)
tests/notifications/notificationsEndpoint.test.ts   — casos de integración del endpoint
```
