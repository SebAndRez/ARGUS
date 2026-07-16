# ARGUS — Política de Vigencia Operacional (Lifecycle Visible, Resolución y Expiración)

**Fecha**: 2026-07-14
**Tipo**: corrección operacional de lectura — **solo lectura, sin persistencia canónica nueva**.
**Alcance**: no se modificó `prisma/schema.prisma`, no se crearon migraciones, no se movió lifecycle desde JSON hacia columnas, no se creó una nueva entidad de incidente, no se modificó deduplicación/severidad/fuentes/cron, no se hizo commit ni push.
**Documentos que preceden y gobiernan esta corrección**: `ARGUS_CANONICAL_INCIDENT_DESIGN.md` (lifecycle canónico de 11 estados, decisión aprobada), `ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md` (mapeador único `KnowledgeIncident → ArgusEvent`), `ARGUS_INCIDENT_MIGRATION_PLAN.md` (fases de migración).

---

## 1. Prerrequisitos — confirmación de decisiones heredadas

| Pregunta | Confirmación |
|---|---|
| Lifecycle canónico aprobado | 11 estados (`DETECTED…ARCHIVED/REJECTED/DUPLICATE`) — `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §8. Es el destino **futuro** de una `Incident.status` tipada; hoy el lifecycle real sigue viviendo en JSON (`technicalFactorsJson.lifecycle`, tags `lifecycle:*`) — esta tarea no lo mueve, solo corrige cómo se *lee*. |
| Función canónica de proyección hacia `ArgusEvent` | `canonicalKnowledgeIncidentToArgusEvent()` (Prompt 9) — ya produce `ArgusEvent.status` de forma unificada para `KnowledgeIncident`. Esta tarea construye sobre ese resultado, no lo duplica. |
| Estados reconocidos | Ver inventario completo §2. |
| Tratamiento acordado para `RESOLVED` | El diseño canónico (Prompt 8, §8.2) dice que `RESOLVED` puede seguir visible en una sección separada "resueltos recientes" sin contar como activo. **Esa sección separada no existe todavía** en los endpoints operacionales de hoy (`/api/vigia/events`, `/api/chile-alerts`, `/api/argus/events` devuelven una sola lista, sin partición). Mientras esa sección no exista, este Prompt aplica la política más conservadora explícita en su propio mandato (§6): `RESOLVED` se excluye de la vista activa única que hoy existe. Esto **no contradice** el diseño del Prompt 8 — lo implementa de forma segura para el estado actual de la UI, sin inventar una sección histórica que no fue pedida en esta tarea (§15). |
| Tratamiento acordado para `ARCHIVED` | Excluido de vistas activas en ambos documentos, sin conflicto. |
| Política de expiración | No estaba resuelta en el diseño previo más allá de identificar el campo muerto `ExternalEvent.expiresAt` (`ARGUS_SYSTEM_MAP.md`, `ARGUS_TECHNICAL_DEBT.md`). Esta tarea define la política conservadora explícita del Prompt 10 §8 (nulo nunca expira; `expiresAt <= now` expira, incluida la igualdad exacta) y la documenta aquí como la decisión vigente. |

Los tres documentos existían y contenían decisiones explícitas suficientes para proceder sin improvisar cambios de esquema — no fue necesario detener la tarea.

---

## 2. Inventario de estados encontrados

Búsqueda sistemática de `detected/validating/confirmed/active/escalating/monitoring/contained/resolved/archived/rejected/duplicate/dismissed/closed/expired/new` (mayúsculas, minúsculas, enums, strings, JSON, filtros Prisma/memoria/frontend) en todo el repositorio, acotada a los sistemas realmente relacionados con vigencia de incidentes (se excluyeron ~60 archivos de módulos verticales — ATLAS/AURA/ARCA/HERMES/ORÁCULO/TALOS/VIGÍA — cuyo uso de estas palabras es vocabulario de negocio interno no relacionado con lifecycle de incidente, fuera de alcance por el Prompt 10 §3 "no conectar módulos").

| Estado encontrado | Modelo | Archivo | Significado actual | ¿Visible como activo (antes)? | Regla canónica (corregida) |
|---|---|---|---|---|---|
| `new` / `active` | `IncidentLifecycle` (KnowledgeIncident) | `src/lib/vigia/incidentLifecycle.ts` | Recién detectado / fuente sigue actualizando | Sí | Sí |
| `monitoring` | `IncidentLifecycle` | ídem | Sin actualización reciente, sin resolver | Sí | Sí |
| `contained` | `IncidentLifecycle` | ídem | Fuente declara control | Sí | Sí (bajo seguimiento) |
| `resolved` | `IncidentLifecycle` | ídem | Sin actualización más allá de la ventana de resolución | **Sí, indebidamente** — `/api/vigia/events` solo filtraba `archived` | **No** |
| `archived` | `IncidentLifecycle` | ídem | Resuelto hace más del doble de la ventana | No (ya se filtraba) | No |
| `lifecycle:cancelled/modified/maintained/declared/active` (tags) | Tags de `KnowledgeIncident.tagsJson` | `src/lib/incidents/alertPromotionEngine.ts` | Vocabulario paralelo de lifecycle para alertas Chile, calculado por texto | `cancelled` **sí** aparecía como vigente en `/api/chile-alerts` (sin filtro alguno) | `cancelled→resolved` (excluido); resto según severidad/campo |
| `observation/risk/active/confirmed/monitoring/resolved/archived` | `ArgusEventStatus` | `src/types/argusEvent.ts` | Salida del mapeador canónico (Prompt 9) y de `argusCorrelationEngine` | `resolved` no se filtraba en `/api/vigia/events`; `/api/chile-alerts` no filtraba nada; `/api/argus/events` no filtraba nada (aunque hoy nunca produce `resolved/archived`, confirmado por inspección) | `resolved/archived` excluidos por defecto; `risk/active/confirmed/monitoring/observation` visibles |
| `NEW/UPDATED/MONITORING/RESOLVED/DISMISSED` | `ArgusNotificationStatus` | `src/types/notificationCenter.ts` | Estado de una notificación | `RESOLVED`/`DISMISSED` ya no se pinneaban ni reservaban slot (correcto), **pero sí sumaban al contador `critical`/`high` del resumen** (bug confirmado, `buildNotificationSummary` solo miraba `severity`) | `RESOLVED`/`DISMISSED` excluidos del conteo `critical`/`high`; pueden seguir en el feed general |
| `NEW/VERIFYING/ARGUS_HYPOTHESIS/OFFICIAL_CONFIRMED/MONITORING/CLOSED/DISMISSED` | `IncidentStatus` (Command Center sintético) | `src/types/incident.ts` | Estado de un `IncidentCommandView` no persistente | `totalActiveIncidents`/`priorityCounts` contaban el array completo sin filtrar por estado (ningún generador demo produce hoy `CLOSED`/`DISMISSED`, confirmado por inspección — el bug era de omisión, no de dato real observado) | `CLOSED`/`DISMISSED` excluidos defensivamente |
| `ExternalEvent.expiresAt` (no es un estado, es una fecha) | `ExternalEvent` | `prisma/schema.prisma`; consultado en `src/app/api/external-events/route.ts`, `src/app/api/notifications/route.ts` | Vencimiento de la fila (p. ej. TTL de 60s para USGS) | **Nunca filtrado** en ninguna query — campo muerto confirmado (coincide con `ARGUS_TECHNICAL_DEBT.md`) | `expiresAt != null AND expiresAt <= now` → excluido |
| `new/verifying/confirmed/responding/resolved/expired/dismissed` (`AlertLifecycleStatus`) | `CrisisEvent` (Report/HelpRequest vía `/api/events`) | `src/lib/alertLifecycle.ts` | Sistema de lifecycle **ya existente y ya correcto** (`isAlertExpired(event, now)` con reloj inyectable) | N/A — no es un bug, es un sistema separado y ya funcional | **Fuera de alcance**: `/api/events` no está en la lista de endpoints del Prompt 10 §2/§19; se documenta su existencia como precedente, no se modifica |

No se normalizaron datos persistidos — solo se corrigió la interpretación de lectura, tal como exige el Prompt 10 §4.

---

## 3. Política única de vigencia

Módulo nuevo: [`src/lib/lifecycle/operationalVisibilityPolicy.ts`](../../src/lib/lifecycle/operationalVisibilityPolicy.ts).

```ts
export function isIncidentOperationallyActive(input: {
  lifecycle: string | null | undefined;
  expiresAt: Date | string | null | undefined;
  now: Date;
}): boolean
```

Propiedades verificadas:
- **Determinista**: mismo input → mismo output (Caso 15, reloj fijo, en `tests/lifecycle/operationalVisibilityPolicy.test.ts`).
- **`now` inyectado**: nunca lee `Date.now()`/`new Date()` internamente; todos los call sites en los endpoints calculan `now` una sola vez por request.
- **No consulta base de datos, no hace red, no lee cookies.**
- **No modifica su entrada** (verificado con un input `Object.freeze`d en los tests).
- **Maneja estados desconocidos** de forma explícita — ver §5.
- **Fail-closed** para lifecycle no reconocido (ver §5); fail-open (no asume expiración) para `expiresAt` nulo o no parseable (ver §6) — dos comportamientos distintos, cada uno justificado por separado, no una regla única "fail-closed" aplicada ciegamente a todo.

### 3.1 Función auxiliar de clasificación

```ts
export function classifyLifecycleVisibility(lifecycle: string | null | undefined): {
  visible: boolean;
  reason: "visible" | "absent_lifecycle" | "terminal_lifecycle" | "unrecognized_lifecycle";
}
```

Expuesta por separado porque algunos call sites (resumen de notificaciones, contador del Command Center) solo necesitan la dimensión de lifecycle, sin `expiresAt` (las notificaciones y los incidentes sintéticos del Command Center no tienen concepto de expiración).

---

## 4. Estados activos vs. terminales

```text
Visibles en vistas activas (no terminales):
  detected, validating, confirmed, active, escalating, monitoring, contained,
  new, observation, risk, updated, verifying, argus_hypothesis, official_confirmed

No visibles en vistas activas (terminales):
  resolved, archived, rejected, duplicate, dismissed, cancelled, closed, expired
```

`CONTAINED` se mantiene visible mientras aún requiere seguimiento, tal como pide el Prompt 10 §6.

Estos estados terminales **no se eliminan de la base de datos** — siguen disponibles para quien consulte directamente `KnowledgeIncident`/`Notification`/Command Center sin pasar por el filtro de vigencia (p. ej. `/api/knowledge-intake/incidents/[id]` para el detalle de un incidente específico, que no fue tocado por esta tarea).

---

## 5. Estados desconocidos — política elegida y justificación

El Prompt 10 §7 ofrece dos opciones y exige que la elección siga el diseño del Prompt 8. El propio mandato del Prompt 10 (§18, Casos 11 y 12) en realidad **distingue dos situaciones distintas** y les exige comportamientos distintos:

1. **Lifecycle *ausente*/vacío** (Caso 12: "comportamiento explícito y testeado", sin exigir fail-closed) → se eligió **visible** (`absent_lifecycle`). Justificación: es exactamente el comportamiento ya aprobado en el mapeador canónico del Prompt 9 (`mapCanonicalLifecycleToArgusStatus`), que ante lifecycle ausente cae a un estado derivado de severidad (nunca un estado terminal) — mantener coherencia con una decisión ya tomada y probada, en vez de introducir una segunda regla para el mismo caso.
2. **Lifecycle *presente pero no reconocido*** en ningún vocabulario conocido (Caso 11: "comportamiento fail-closed documentado; no se convierte en confirmado") → se eligió **no visible** (`unrecognized_lifecycle`), fail-closed explícito. Justificación: un valor que no pertenece a ningún vocabulario conocido es, con más probabilidad, un dato corrupto o de un origen no contemplado — mostrarlo como activo sin poder clasificarlo sería inventar confirmación, exactamente lo que el Prompt 10 §7 prohíbe explícitamente ("no convierta un estado desconocido en ACTIVE/CONFIRMED/CRITICAL por defecto").

Este valor no reconocido se registra vía `logUnrecognizedLifecycle()` (console.warn controlado, solo id interno + fuente + valor, nunca el payload completo) para observabilidad (Prompt 10 §20), y se invoca únicamente desde los endpoints (nunca desde la función pura misma, que no tiene efectos secundarios).

---

## 6. Política de expiración (`ExternalEvent.expiresAt`)

Revisión del modelo real:
- `expiresAt DateTime?` — **nullable**, confirmado en `prisma/schema.prisma`.
- Se asigna en `src/lib/ingestion/persistExternalEvents.ts` a partir del TTL del caché de cada fuente (p. ej. 60s para USGS) — no todas las fuentes garantizan poblarlo.
- No existen inconsistencias de zona horaria: es una columna `DateTime` de Postgres (siempre UTC internamente), y todas las comparaciones de esta tarea usan objetos `Date`/instantes, nunca comparación de strings.

Regla aplicada:
```text
expiresAt != null AND expiresAt <= now  → expirado, excluido
expiresAt == null                        → nunca se asume expiración; se preserva
fecha presente pero no parseable         → se trata igual que null (no se asume expiración
                                            a partir de un dato corrupto — ver razonamiento
                                            abajo)
```

**Por qué una fecha corrupta no se trata como expirada** (decisión explícita, ya que el mandato no lo especifica): el daño documentado que esta tarea corrige es que datos *vencidos* se muestren como *vigentes* — la dirección de error ya identificada y priorizada. Tratar un dato *corrupto* (no nulo, pero no parseable) como automáticamente expirado introduciría el error opuesto: ocultar una alerta real por un problema de formato ajeno a su vigencia real. Se prefiere no asumir en ninguna dirección y aplicar la misma política que a un valor ausente, documentado aquí explícitamente como corresponde a una decisión no cubierta por el mandato original.

---

## 7. Orden del pipeline

Aplicado consistentemente en los endpoints modificados, siguiendo el orden recomendado por el Prompt 10 §12:

```text
lectura (Prisma / servicio) → normalización (mapeador canónico) → lifecycle/vigencia → filtros propios del endpoint → orden → límite → respuesta
```

### Filtros en Prisma (directo, columna real)
- `src/app/api/external-events/route.ts`: `where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }` — columna `DateTime`, filtro portable y directo.
- `src/app/api/notifications/route.ts` (`getPersistedExternalEvents`): mismo filtro, misma justificación.

### Filtros en memoria, inmediatamente después de leer (JSON, no portable de forma segura)
- `src/app/api/vigia/events/route.ts`, `src/app/api/chile-alerts/route.ts`: `technicalFactorsJson.lifecycle` y `tagsJson` (array) no se pueden expresar de forma simple y portable como una única condición Prisma que cubra ambos vocabularios (campo vs. tag) más el caso "campo ausente" — se filtra en memoria justo después de mapear a `ArgusEvent`, **antes** de recortar a `limit`.

### Limitación documentada (Prompt 10 §9)
Como Prisma no puede filtrar el lifecycle en la query, ambos endpoints **sobre-consultan** un margen (`FETCH_OVERSCAN_MULTIPLIER = 3`, tope `MAX_FETCH_ROWS = 800` para `/api/vigia/events`; tope interno de 200 filas de `getKnowledgeIncidents` para `/api/chile-alerts`) antes de filtrar y recortar a `limit`. Esto **reduce pero no elimina matemáticamente** el riesgo de una página incompleta: si más del 66% de la ventana sobre-consultada resultara no vigente, la respuesta podría devolver menos de `limit` eventos aunque existan más vigentes fuera de esa ventana. Se documenta como limitación conocida en vez de sobre-diseñar una solución no portable — la corrección real y completa de este límite pertenece a la Fase C de `ARGUS_INCIDENT_MIGRATION_PLAN.md` (lifecycle como columna tipada, filtrable nativamente).

---

## 8. Reglas de conteo

| Contador | Antes | Ahora |
|---|---|---|
| `/api/vigia/events` — lista de eventos | Incluía `resolved`; filtraba `archived` únicamente | Excluye todo estado terminal (§4), filtrado antes del límite |
| `/api/chile-alerts` — lista de eventos | No filtraba ningún estado | Excluye todo estado terminal |
| `/api/argus/events` — lista de eventos | No filtraba ningún estado (hoy no produce estados terminales, confirmado por inspección de `statusFromTipoAlerta()` y de `demoArgusEvents`) | Filtro defensivo aplicado por defecto; `?status=` explícito preserva la consulta puntual/histórica |
| `/api/notifications` → `summary.critical` / `summary.high` | Contaba por `severity` únicamente — un incidente crítico resuelto seguía sumando | Excluye `RESOLVED`/`DISMISSED` vía `classifyLifecycleVisibility` |
| `/api/command/overview` → `totalActiveIncidents` / `priorityCounts` / `topIncidents` | Contaba el array completo de `getCommandCenterIncidents()` sin filtrar estado | Excluye `CLOSED`/`DISMISSED` |

`summary.total`, `summary.unread` y los contadores por `scope` (`local/national/international/global`) se dejaron **intactos a propósito** — no reclaman representar "activos", y una notificación de resolución puede seguir apareciendo en el feed general (Prompt 10 §14: "una notificación de resolución puede existir").

---

## 9. Historial

No se borró ningún dato. La distinción `excluir de vista activa ≠ eliminar de base de datos` se cumple en todos los cambios: todos los filtros aplicados son de **lectura** (`WHERE`/`filter()`), ninguno es un `DELETE`/`deleteMany`/actualización masiva.

Endpoints/mecanismos que **sí** permiten consultar estados terminales hoy (se mantienen, no se tocaron):
- `/api/argus/events?status=resolved` (o cualquier valor de `ArgusEventStatus`) — preservado explícitamente en esta misma tarea (§7 del código, ver `src/app/api/argus/events/route.ts`).
- `/api/external-events?includeExpired=true` — flag nuevo, añadido en esta tarea específicamente para no perder la capacidad de auditar el histórico completo de `ExternalEvent`.
- `/api/knowledge-intake/incidents/[id]` — detalle de un incidente por id, sin filtro de lifecycle (no tocado, ya sirve como vista de detalle/historial implícita).

No existe hoy un endpoint histórico dedicado y agregado (p. ej. "todos los incidentes resueltos de los últimos 30 días") — **no se creó uno en esta tarea** (Prompt 10 §15: "si no existen, no cree un sistema histórico completo; documente la brecha"). Queda como brecha documentada para una fase futura.

---

## 10. Reapertura

La política de lectura (`isIncidentOperationallyActive`) es una función pura sin memoria: **no decide reaperturas, solo refleja el lifecycle que se le pasa en cada llamada** (Caso 16, probado explícitamente en `tests/lifecycle/operationalVisibilityPolicy.test.ts`). La reapertura real ocurre exclusivamente en la escritura (`sweepIncidentLifecycles()`, revisado en §11) — si un incidente resuelto recibe evidencia nueva y el sweep recalcula su lifecycle a `active`, la *siguiente* lectura lo mostrará vigente automáticamente, sin que esta tarea haya tenido que tocar el sweep ni inventar lógica de reapertura en la capa de lectura.

---

## 11. Revisión de `sweepIncidentLifecycles()` (sin cambios de código)

Archivo real: `src/lib/vigia/incidentLifecycle.ts` (el Prompt 10 §2 sugiere `src/lib/vigia/sweepIncidentLifecycles.ts` — ese archivo no existe; la función vive en `incidentLifecycle.ts`, se deja constancia de la discrepancia).

Revisado explícitamente contra los cuatro riesgos que el Prompt 10 §16 pide descartar:

| Riesgo | Verificado | Evidencia |
|---|---|---|
| Incidente resuelto vuelve a activo sin evidencia nueva | **No ocurre** | `computeLifecycle()` es puro y sin estado — recalcula desde `lastSourceUpdateAt` en cada corrida; sin una actualización real de `updatedAt`/`detectedAt`, el resultado no cambia |
| Incidente activo nunca llega a resuelto | **No ocurre** | Las ventanas `resolveHours`/`activeHours` por tipo de amenaza (`LIFECYCLE_WINDOWS`) garantizan degradación monotónica sin nuevas actualizaciones |
| Incidente archivado se procesa como activo | **No ocurre** | `archived` requiere `hoursSinceUpdate > resolveHours * 2`; un incidente en ese estado no vuelve a `active` salvo con una actualización real posterior (comportamiento correcto, no un bug) |
| Evento con evidencia reciente se archiva incorrectamente | **No confirmado como bug de `computeLifecycle` en sí** | Ver limitación documentada abajo |

**Limitación encontrada, documentada, no corregida** (fuera de alcance — corregirla requeriría tocar `globalWatchEngine.ts`/deduplicación, prohibido por el Prompt 10 §3): el parámetro `seenInCurrentRun` de `computeLifecycle()` existe en la firma pero **nunca se pasa** desde `sweepIncidentLifecycles()` (línea ~119 de `incidentLifecycle.ts`, siempre `undefined`). En la práctica esto no causa el riesgo #4 porque `lastSourceUpdateAt = incident.detectedAt ?? incident.updatedAt` ya refleja la última escritura real — pero si en el futuro `upsertKnowledgeIncidentByExternalId`/`shouldUpdateExistingIncident` decidiera *no* escribir una actualización cuando el contenido no cambió (optimización legítima de dedup), un incidente que la fuente sigue reportando sin cambios podría decaer a `resolved`/`archived` igualmente. No se modificó el sweep para wirear este parámetro porque hacerlo correctamente requiere que `globalWatchEngine.ts` rastree qué incidentes fueron efectivamente re-observados en cada corrida y se lo pase al sweep — un cambio de la ingesta, explícitamente fuera de alcance de esta tarea. Se deja como deuda documentada (§13).

No se modificó el sweep. No se requiere test específico nuevo para el sweep porque no se le cambió comportamiento (Prompt 10 §16: "cualquier cambio al sweep debe estar acompañado de test específico" — no aplica, no hubo cambio).

---

## 12. Limitaciones por lifecycle en JSON

- `technicalFactorsJson.lifecycle` y `tagsJson` no son consultables de forma portable/segura como una única condición Prisma — ver §7 para la mitigación de sobre-consulta adoptada y su límite matemático conocido.
- Dos vocabularios coexisten para el mismo hecho en incidentes Chile (campo `technicalFactors.lifecycle` con vocabulario `IncidentLifecycle`, y tag `lifecycle:*` con vocabulario propio) — el mapeador canónico del Prompt 9 ya resuelve la precedencia entre ambos (tag `cancelled` gana siempre, luego el campo, luego un fallback por severidad); esta tarea reutiliza ese resultado ya resuelto (`ArgusEvent.status`) en vez de volver a interpretar el JSON crudo por segunda vez.
- El Command Center (`IncidentStatus`) y las notificaciones (`ArgusNotificationStatus`) tienen sus propios vocabularios, independientes de `KnowledgeIncident` — la política de este Prompt los cubre mediante el mismo conjunto de valores terminales/no-terminales (case-insensitive), pero **no los unifica** — esa unificación pertenece a la persistencia canónica futura (Fase C).

---

## 13. Deuda futura (riesgos pendientes explícitamente fuera de esta tarea)

- **Lifecycle todavía almacenado en JSON**: `technicalFactorsJson.lifecycle` sigue sin ser una columna tipada — la Fase C de `ARGUS_INCIDENT_MIGRATION_PLAN.md` sigue pendiente en su totalidad; esta tarea es puramente de lectura.
- **Falta de historial dedicado**: no existe un endpoint agregado de "incidentes resueltos/archivados recientes" — documentado como brecha en §9, no resuelto aquí.
- **Transición automática**: `seenInCurrentRun` sin wirear en el sweep (§11) — riesgo teórico de archivado prematuro si la política de dedup cambiara en el futuro para omitir escrituras de "sin cambios"; no se observó como bug activo hoy.
- **Futura persistencia canónica**: `canonicalKey`, `IncidentTransition`, y las columnas de severidad/confianza/lifecycle tipadas del diseño del Prompt 8 (§5, §7-10) siguen sin implementarse — esta tarea corrige únicamente la capa de lectura sobre el modelo actual.
- **`/api/events` (Report/HelpRequest) no fue tocado**: ya tiene su propio sistema de lifecycle funcional (`src/lib/alertLifecycle.ts`, `isAlertExpired` con reloj inyectable) — fuera de la lista de endpoints del Prompt 10, documentado en §2 como precedente ya correcto, no como brecha.
