# ARGUS — Baseline de Operaciones de Fuentes (Scheduler Real, Registro Canónico, Source Health Verificable)

**Fecha**: 2026-07-14
**Tipo**: consolidación de arquitectura de ingestión — registro canónico de fuentes, scheduler por fuente, Source Health dinámico.
**Alcance**: no se modificó `prisma/schema.prisma`, no se crearon migraciones, no se implementaron adaptadores nuevos, no se activaron fuentes sin credenciales, no se cambió el modelo canónico de incidente, no se modificaron módulos ni el mapa, no se hizo commit ni push.

---

## 0. Nota sobre el origen de este documento

Gran parte de la implementación descrita aquí (`src/lib/vigia/sourceOperationsRegistry.ts`, `sourceOperationsHealth.ts`, `sourceScheduler.ts`, las rutas `/api/vigia/source-health/{public,full}`, y los tres archivos de test en `tests/vigia/`) fue construida y verificada en este mismo repositorio antes de redactar este documento. Este documento la audita, corrige un defecto de orden de precedencia encontrado en `deriveSourceOperationalStatus()` (§5.1), corrige una clasificación incorrecta de `copernicus_glofas` (§5.2), y completa lo que faltaba: `.env.example`, esta línea base y el backlog de activación (`ARGUS_SOURCE_ACTIVATION_BACKLOG.md`). Todo lo demás se adoptó tal cual, tras verificación completa (352/352 tests, typecheck y lint limpios).

---

## 1. Principio de verdad operacional

Una fuente solo se declara `operational` si se puede demostrar, con evidencia real (no supuesta), toda la cadena:

```text
configurada → programada → ejecutada → respuesta validada → normalizada → persistida/utilizada → observable → consumida
```

Ninguna fuente se declara operativa solo porque exista un archivo de adaptador, una tarjeta de UI, una entrada de registry, una función de health check, o porque responda una vez a una solicitud manual.

---

## 2. Registros encontrados (inventario completo, no solo los citados en la auditoría previa)

| Registro | Ubicación | Propósito real | Estado anterior (auditoría 2026-07-13) | Estado final (esta tarea) |
|---|---|---|---|---|
| `VIGIA_SOURCE_REGISTRY` | `src/lib/vigia/sourceRegistry.ts` | Fuentes que Global Watch efectivamente itera cada corrida (11 entradas) — capacidad + `enabled` + `requiresEnvVar` | Única fuente de verdad para "qué corre por cron" | **Sin cambios de forma** — sigue siendo lo que `globalWatchEngine.ts` itera; el registro canónico nuevo (`ARGUS_SOURCE_OPERATIONS_REGISTRY`) replica sus 11 entradas para el inventario ampliado, no las reemplaza (evita romper `globalWatchEngine.ts` y los consumidores existentes de `getVigiaSourceHealth()`) |
| `ARGUS_SOURCE_OPERATIONS_REGISTRY` (**nuevo**) | `src/lib/vigia/sourceOperationsRegistry.ts` | Registro canónico ampliado — capacidad + rol + estado de adaptador de las ~43 fuentes conocidas (programadas, reales sin programar, stub, chilenas sin adaptador) | No existía | **Fuente de verdad única** para responder "¿esta fuente alimenta ARGUS hoy?" — ver §4 |
| `src/config/argusSourceRegistry.ts` + `src/lib/sources/sourceRegistry.ts` (`ARGUS_OPERATIONAL_SOURCE_REGISTRY`) + `src/lib/sources/sourceHealthEngine.ts` | — | Registro de tier/prioridad + salud del pipeline legado `/api/argus/events` (`argusCorrelationEngine`/SENAPRED en vivo, ver `ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md` §2, "tercer sitio de construcción de ArgusEvent") — dominio distinto (`ArgusExternalSourceId`), no comparte tipos ni datos con Global Watch | Registro paralelo preexistente | **Sin tocar** — dominio genuinamente distinto (alimenta `/api/argus/events`/`/api/argus/sources`, no `KnowledgeIncident`); fusionarlo excede el alcance ("no rediseñar el mapa/módulos") y no resuelve ninguna ambigüedad real (ningún consumidor confunde ambos) |
| `src/lib/sources/countrySourceRegistry.ts` + `src/data/countrySourcePacks/*` | — | Gobernanza de atribución oficial/prensa por país (`CountrySourcePack`, `ArgusSourceType`) para el estándar `ArgusEvent` — incluye las 6 filas `requires_parser` de `chile.ts` | Registro de gobernanza, no de ejecución | **Sin tocar** — las 6 filas `requires_parser` de Chile se **referencian** desde `ARGUS_SOURCE_OPERATIONS_REGISTRY` (grupo `CHILE_UNCONNECTED_SOURCES`) como hecho operativo ("cero código de ingestión"), sin duplicar su propósito de gobernanza |
| `src/lib/knowledge-intake/sourceRegistry.ts` (+ `src/data/knowledgeSourceRegistry.ts`, respaldado por la tabla `KnowledgeSource`) | — | Catálogo declarativo de las ~30+ fuentes de `knowledge-intake` (dominios, tipo de input, licencia) usado por `/api/knowledge-intake/health`, `/api/knowledge-intake/sources` | Registro de catálogo/licencia | **Sin tocar** — es el catálogo de referencia (licencia, dominios, modo de ingestión) que documenta capacidad declarativa; `ARGUS_SOURCE_OPERATIONS_REGISTRY` es el que decide **estado operacional real** para las mismas fuentes, sin necesitar fusionar ambos |
| `getVigiaSourceHealth()` → `/api/vigia/source-health` | `src/lib/vigia/sourceRegistry.ts` | Salud runtime de las 11 fuentes de Global Watch (`OK/WARN/ERROR/DISABLED`) | Único endpoint de salud de Global Watch | **Sin cambios** — sigue sirviendo al panel `/admin/source-health` existente, endpoint aditivo (no reemplazado) |
| `getSourceOperationsHealth()` → `/api/vigia/source-health/{public,full}` (**nuevo**) | `src/lib/vigia/sourceOperationsHealth.ts` | Salud dinámica sobre las ~43 fuentes del registro canónico, con vista pública y de operador separadas | No existía | Nuevo, aditivo — ver §7 |
| `/api/knowledge-intake/health` | `src/app/api/knowledge-intake/health/route.ts` | Salud de config/wiring de cada adaptador de `knowledge-intake` (llama a la función estática `getXAdapterStatus()`/`getXConfigStatus()` de cada uno) | Chequeo de configuración estática, no de ejecución real | **Sin tocar** — complementario, no contradictorio: confirma "¿el adaptador está bien configurado?", no "¿está corriendo por scheduler?" (esa pregunta la responde el registro canónico) |
| `/api/firms/health` | `src/app/api/firms/health/route.ts` | Salud dedicada solo de FIRMS | Endpoint específico preexistente | **Sin tocar** — subconjunto de lo que ya cubre `/api/vigia/source-health` para `nasa_firms`, sin contradicción de datos |

**Ningún registro fue fusionado** — el mandato pide que quede **una sola fuente de verdad para los campos específicos listados en el Prompt 16 §6** (capacidad + estado operacional de una fuente de ingestión), no que se elimine cualquier otro registro con un propósito distinto (gobernanza de atribución, tier/prioridad del pipeline legado, catálogo de licencias). Esa fuente única es `ARGUS_SOURCE_OPERATIONS_REGISTRY`.

---

## 3. Taxonomías

### 3.1 Estado operacional (`SourceOperationalStatus`)

```ts
export type SourceOperationalStatus =
  | "operational"             // programada, configurada, con éxito reciente, sin fallos consecutivos graves
  | "degraded"                // ejecuta pero con fallos recientes / éxito obsoleto / resultados parciales
  | "configured_not_scheduled"// adaptador real, sin scheduler ni evidencia de ejecución todavía
  | "manual_only"             // adaptador real, se ejecuta solo por acción de operador (con evidencia de al menos una ejecución)
  | "missing_credentials"     // faltan variables de entorno requeridas
  | "not_configured"          // capacidad insuficiente para siquiera intentar ejecución
  | "stub"                    // no existe implementación real (plannedAdapterResult o sin fetch())
  | "broken"                  // estructuralmente incapaz de completar una ejecución válida
  | "disabled"                // desactivada intencionalmente
  | "retired";                // ya no debe usarse
```

Nunca se usa un estado genérico tipo `available`.

### 3.2 Rol de fuente (`SourceRole`)

```ts
export type SourceRole = "detection" | "confirmation" | "enrichment" | "context" | "historical";
```

Un adaptador `context` (p. ej. Open-Meteo) **nunca** se considera fallido por no crear incidentes — es su comportamiento correcto. Una fuente `historical` (OpenFEMA, NOAA Storm Events, NOAA NCEI Tsunami) **nunca** debe programarse con cadencia live.

### 3.3 Capacidad declarada — distinta del estado dinámico

```ts
SourceExecutionMode = "scheduled" | "manual" | "context_only" | "disabled";
SourceAdapterStatus = "implemented" | "stub" | "broken";
```

El registro (`ArgusSourceDefinition`) declara **capacidad** (qué existe, qué requiere). El estado operacional (`SourceOperationalStatus`) se **deriva** en cada consulta a partir de esa capacidad más la señal de ejecución real (`SourceHealthSignal`, calculada desde `KnowledgeIngestionRun`) — nunca se persiste como constante estática, tal como exige el Prompt 16 §6.

### 3.4 Errores normalizados (`SourceErrorCode`)

```text
TIMEOUT | RATE_LIMITED | AUTH_MISSING | AUTH_INVALID | NETWORK_ERROR |
PARSING_ERROR | UPSTREAM_5XX | PERSISTENCE_ERROR | LOCKED | DISABLED
```

`classifySourceError()` (`sourceScheduler.ts`) traduce el error crudo (HTTP status, mensaje) a uno de estos 10 códigos — el mensaje original del proveedor nunca se expone como contrato público, solo vive en logs.

---

## 4. Registro canónico (`ARGUS_SOURCE_OPERATIONS_REGISTRY`, 43 fuentes)

Campos por entrada: `id, name, category, coverage, role, executionMode, adapterStatus, isOfficial, reliabilityScore, requiredEnv, endpoint, timeoutMs, scheduler?, consumer, managedByJob?, notes`.

### 4.1 Grupo A — programadas (11, sin cambios de activación en esta tarea)

| Fuente | Rol | Intervalo | Owner | Consumidor |
|---|---|---:|---|---|
| `usgs_earthquake` | detection | 5 min | globalWatchEngine | KnowledgeIncident + evidencia (mapa, notificaciones) |
| `gdacs` | detection | 15 min | globalWatchEngine | ídem |
| `nasa-eonet` | detection | 30 min | globalWatchEngine | ídem |
| `nasa_firms` | detection | 15 min | globalWatchEngine | KnowledgeIncident + evidencia (correlación de incendios, Prompt 15) |
| `copernicus_effis` | confirmation | 30 min | globalWatchEngine | ídem |
| `copernicus_ems` | confirmation | 60 min | globalWatchEngine | ídem |
| `reliefweb` | detection | 30 min | globalWatchEngine | KnowledgeIncident + evidencia |
| `senapred_eventos` | detection | 15 min | chile-alerts job (delegado bajo lock compartido) | KnowledgeIncident + evidencia |
| `dmc_meteochile_mention` | enrichment | — (`context_only`) | — | Evidencia adjunta al incidente SENAPRED relacionado |
| `open-meteo` | context | — (`context_only`) | — | Contexto bajo demanda, sin persistencia propia |
| `news_evidence` | context | — (`manual`, adapterStatus `stub`) | — | Evidencia curada manualmente |

### 4.2 Grupo B — candidatas, ninguna activada esta tarea (justificación en §6)

Los 18 adaptadores de `UNSCHEDULED_REAL_ADAPTERS` (NWS, NOAA CO-OPS, NOAA NCEI Tsunami, NOAA Storm Events, IOC SLSMF, OpenAQ, HDX HAPI, WHO DON, ECDC, Copernicus GFM, Smithsonian GVP, USGS PAGER/ShakeMap, OpenFEMA, USGS Water, USGS Volcano HANS, OSM Overpass, GDELT) tienen `fetch()` real con timeout, pero **ninguno** tiene normalizador a `ArgusIncidentKnowledge`, deduplicación, ni persistencia idempotente conectada a `KnowledgeIncident` — no satisfacen los criterios completos de Grupo B (Prompt 16 §8). Se documentan en detalle, con la brecha específica de cada uno, en `ARGUS_SOURCE_ACTIVATION_BACKLOG.md`.

### 4.3 Grupo C — no programar (14)

- **8 stubs** (`STUB_ADAPTERS`): `conaset_chile`, `senapred_chile_knowledge_intake_stub`, `csb_global`, `iaea_global`, `ntsb_global`, `nhtsa_global`, `desinventar_global`, `emdat_global` — todos `plannedAdapterResult`, cero fetch real.
- **1 reclasificado a stub en esta tarea**: `copernicus_glofas` (ver §5.2).
- **6 fuentes chilenas sin adaptador** (`CHILE_UNCONNECTED_SOURCES`): `csn_chile`, `shoa_chile`, `sernageomin_chile`, `mop_vialidad_chile`, `dga_chile`, `conaf_chile` — instituciones reales y autoritativas, cero código de ingestión (`requires_parser` en `chile.ts`).

---

## 5. Correcciones aplicadas durante esta tarea

### 5.1 Orden de precedencia en `deriveSourceOperationalStatus()`

**Defecto encontrado**: la función evaluaba `executionMode === "disabled"` **antes** que `adapterStatus === "stub"`. Como las 14 entradas de Grupo C combinan `adapterStatus: "stub"` con `executionMode: "disabled"`, el verdicto dinámico las devolvía como `disabled` en vez de `stub` — indistinguible de una fuente real que alguien apagó a propósito, contradiciendo la taxonomía del Prompt 16 §5 ("`stub`: no existe implementación real" vs "`disabled`: fue desactivada intencionalmente", dos hechos distintos). Detectado por el propio test ya existente (`Caso 5`), que fallaba antes de la corrección. **Corrección**: se invirtió el orden — `stub` se evalúa primero, por ser el hecho más específico y más informativo. Verificado: 352/352 tests pasan tras el cambio, incluida la invariante ya existente "ninguna fuente stub/disabled declara executionMode scheduled".

### 5.2 Reclasificación de `copernicus_glofas`

**Defecto encontrado**: el registro clasificaba `copernicus_glofas` como `adapterStatus: "implemented"`, pero la inspección directa de `src/lib/knowledge-intake/adapters/copernicusGlofasAdapter.ts` (grep de `fetch(` sobre el archivo completo) confirma **cero llamadas de red reales** — `fetchGlofasForecastMetadata()`/`fetchGlofasForecastSubset()` construyen la URL y validan parámetros, pero siempre retornan `{status:"prepared", records:[]}` con la advertencia explícita en el propio código fuente ("heavy NetCDF/GRIB subset parsing is deferred"), incluso con la credencial configurada. Esto es exactamente la definición de `stub` del Prompt 16 §5 ("no ejecuta ninguna consulta real"), no la de `implemented`, aunque el archivo no use literalmente el helper `plannedAdapterResult`. **Corrección**: reclasificado a `adapterStatus: "stub"`, `executionMode: "disabled"`, `reliabilityScore: 0`, con la nota de reclasificación documentada inline en el registro. Este es el ejemplo concreto del Prompt 16 §2: "no utilice ciegamente la matriz de auditoría... la fuente de verdad final debe ser el estado actual del repositorio".

---

## 6. Decisión de activación (Grupo A/B/C) y justificación

**No se activó ninguna fuente nueva en esta tarea.** Las 18 candidatas de Grupo B fallan uniformemente el mismo criterio: tienen adaptador real (fetch + timeout + tipos), pero ninguna tiene los tres elementos restantes que exige el Prompt 16 §8 para calificar — normalizador canónico a `ArgusIncidentKnowledge`/`ArgusHazardDomain`, deduplicación (`buildGlobalDedupKey` o equivalente), y persistencia idempotente conectada a `KnowledgeIncident`. Conectarlas al scheduler sin esos tres elementos violaría el Prompt 16 §3.9 ("impedir que fuentes manuales o stub aparezcan como operativas") de otra forma: aparecerían como `operational` sin nunca escribir un `KnowledgeIncident` real, exactamente el hallazgo P2 que esta tarea corrige, no lo repite.

Prioridad orientativa para una fase futura de activación (Prompt 16 §9), de mayor a menor valor operacional, documentada en detalle por fuente en `ARGUS_SOURCE_ACTIVATION_BACKLOG.md`:
1. **WHO DON** (salud pública, sin credenciales, solo falta normalizador+persistencia+tests).
2. **NWS** (multi-amenaza EE.UU., sin credenciales obligatorias).
3. **Smithsonian GVP** (volcanes, sin credenciales).
4. **USGS Volcano HANS** (volcanes, sin credenciales).
5. **ECDC** (confirmación de WHO DON en Europa, ya tiene clave de dedup cruzada sin invocar).
6. **USGS PAGER/ShakeMap** (enriquecimiento de sismos existentes — nunca debe crear un segundo incidente, ejemplo explícito del Prompt 16 §9).
7. **OpenFEMA** (histórico/declarativo — nunca debe tratarse como fuente live, ejemplo explícito del Prompt 16 §9).
8. **NOAA Storm Events / NOAA NCEI Tsunami** (históricos, cadencia diaria o manual, nunca live).
9. **IOC SLSMF / OpenAQ / HDX HAPI / Copernicus GFM** (requieren credencial no configurada hoy — bloqueadas por `missing_credentials`, no por falta de código).
10. **NOAA CO-OPS / OSM Overpass** (rol contextual — candidatos a `context_only` conectado a enriquecimiento puntual, no a cadencia propia).
11. **GDELT** (señal de cobertura mediática — rol `context` deliberado, nunca `detection`; ver §7).

---

## 7. GDELT (Prompt 16 §20)

**Hallazgo verificado por lectura directa del código** (no supuesto de la auditoría previa): `gdeltAdapter.ts` **sí** es funcional — hace un `fetch()` real contra `api.gdeltproject.org/api/v2/doc/doc`, con `AbortController`/timeout. La caracterización de "roto" en `ARGUS_SOURCE_MATRIX.md` se refería al caso distinto de `news_evidence` dentro de `globalWatchEngine.ts` (que retorna `fetched: 0` incondicionalmente sin tocar GDELT en absoluto) — no al adaptador GDELT en sí, que nunca fue invocado desde ese switch. Ambos hechos son reales mas independientes entre sí.

**Decisión**: GDELT queda con `role: "context"` (señal de cobertura mediática, nunca `detection` — no debe convertir cada noticia en incidente) y `executionMode: "manual"`. El test `sourceOperationsRegistry.test.ts` ("Caso 16") verifica explícitamente que, sin scheduler, GDELT nunca puede derivar `operational` — ni con historial de ejecución previa ni sin él.

---

## 8. Open-Meteo (Prompt 16 §21)

`role: "context"`, `executionMode: "context_only"`. Nunca crea incidente, nunca cuenta como fuente de detección. `deriveSourceOperationalStatus()` trata `context_only` como un caso especial: sin historial de fallos, se declara `operational` de inmediato (Caso 14, testeado) — una fuente de contexto **no** se considera fallida solo por no tener historial de ejecución propio, porque por diseño se invoca bajo demanda (coordenada/incidente puntual), no por cadencia. `globalWatchEngine.ts` ya excluía `role === "context"` de su bucle de fetch antes de esta tarea (`source.role === "context"` filtrado en `sourcesToRun`) — comportamiento preexistente, confirmado correcto, sin cambios.

---

## 9. Scheduler (`src/lib/vigia/sourceScheduler.ts`)

### 9.1 Selección por vencimiento

```ts
shouldRunSource({ lastAttemptAt, lastSuccessAt, intervalMinutes, now, consecutiveFailures })
  → { shouldRun, reason: "never_run"|"due"|"not_due"|"backoff", minutesUntilDue }
```

Diferencia último intento de último éxito: el intervalo efectivo se mide desde el último **intento** (para no reintentar antes de tiempo tras un fallo reciente), pero el backoff se activa por fallos consecutivos, no por mera ausencia de éxito. Wireado en `globalWatchEngine.ts`: una sola consulta acotada (`getRecentIngestionRunsBySource`, ventana de 30 corridas) resuelve el historial de todas las fuentes de la corrida, nunca una consulta por fuente.

### 9.2 Frecuencias (ya declaradas por fuente en `VIGIA_SOURCE_REGISTRY`/registro canónico, sin cambios de valor en esta tarea)

| Rol/fuente | Frecuencia | Justificación |
|---|---:|---|
| Sismos (USGS) | 5 min | Alta prioridad, sin costo de credencial, cambios rápidos |
| Multi-amenaza (GDACS) | 15 min | Cadencia de RSS del proveedor |
| Incendios satelitales (FIRMS) | 15 min | Pasadas VIIRS, `days=2` en la consulta |
| EFFIS | 30 min | WFS actualiza ~2 veces/día; 30 min es suficientemente frecuente sin sobrecargar un WFS lento (~30s de respuesta) |
| Copernicus EMS | 60 min | Activaciones no cambian minuto a minuto |
| ReliefWeb / EONET | 30 min | Cadencia de publicación humanitaria/multi-amenaza |
| SENAPRED | 15 min | Alertas oficiales de emergencia nacional |
| Históricas (OpenFEMA, NOAA Storm Events, NOAA NCEI Tsunami) | No programadas | Por diseño — nunca cadencia live (Prompt 16 §9) |
| Contexto (Open-Meteo, DMC) | Bajo demanda | Sin cadencia propia — se invoca junto al incidente/coordenada que enriquecen |

### 9.3 Backoff exponencial con tope

```ts
computeBackoffIntervalMinutes(baseIntervalMinutes, consecutiveFailures)
  = baseIntervalMinutes × min(2^consecutiveFailures, 8)
```

Nunca reintenta indefinidamente a la cadencia normal tras fallos repetidos, nunca crece sin límite (evita que una fuente rota quede efectivamente desactivada para siempre por backoff infinito).

### 9.4 Lock por fuente

```text
argus:source-lock:<source-id>
```

`acquireSourceLock(sourceId, runId, ttlMs?)` reutiliza las primitivas atómicas de `jobLockBackend.ts` (`SET NX PX` distribuido / equivalente en memoria para dev-test) **sin** extender el tipo cerrado `JobLockName` de `jobLock.ts` (que sigue gobernando exactamente los 3 locks de pipeline ya en producción: `global-watch`, `chile-alerts`, `senapred-ingestion` — no se tocó ese archivo). Evita ejecución manual+programada simultánea, dos instancias serverless, y reintentos superpuestos de la **misma** fuente; un job global sigue pudiendo ejecutar varias fuentes distintas en paralelo (locks independientes por `sourceId`, verificado por test).

### 9.5 Timeout explícito por adaptador

`runWithTimeout(sourceId, timeoutMs, fn)` — guarda externa vía `Promise.race`, no reemplaza el `AbortController` interno de cada adaptador (primera línea de defensa) pero garantiza que ninguna fuente pueda consumir más que su `timeoutMs` declarado en el registro incluso si el adaptador tuviera un bug en su propio timeout. Al superarse: se marca fallo, las demás fuentes de la corrida continúan (`Promise.all` por fuente, aislado), no se persiste resultado parcial inválido.

---

## 10. Source Health dinámico

### 10.1 Señal (`SourceHealthSignal`)

```text
lastAttemptAt, lastSuccessAt, lastFailureAt, lastDurationMs, lastRecordCount,
consecutiveFailures, lastErrorCode, credentialsConfigured
```

Calculada desde `KnowledgeIngestionRun` (ventana de 400 corridas recientes, `getRecentIngestionRunsBySource`) — nunca desde un contador en memoria del proceso (no compartido entre instancias serverless).

### 10.2 Reglas de derivación (`deriveSourceOperationalStatus`, orden de evaluación)

1. `adapterStatus === "stub"` → `stub` (corregido en esta tarea, ver §5.1).
2. `executionMode === "disabled"` → `disabled`.
3. `adapterStatus === "broken"` → `broken`.
4. Credencial requerida ausente → `missing_credentials`.
5. `consecutiveFailures ≥ 5` (`BROKEN_CONSECUTIVE_FAILURES_THRESHOLD`) → `broken` (aunque el registro diga `implemented` — el estado dinámico puede ser más severo que la capacidad estática, nunca más optimista).
6. `context_only`: `operational` si no hay fallos recientes, `degraded` si los hay — nunca "fallido" por ausencia de historial.
7. `manual`: `configured_not_scheduled` si nunca se ejecutó; `manual_only` si ya se ejecutó al menos una vez.
8. `scheduled`: `degraded` si nunca se ejecutó todavía; `configured_not_scheduled` si le falta la definición de `scheduler`; `degraded` si hay fallos recientes o el último éxito superó 3× el intervalo esperado (`STALE_SUCCESS_INTERVAL_MULTIPLIER`); `operational` en el caso sano.

Nunca se declara `operational` solo porque el endpoint respondió HTTP 200 una vez — se exige éxito **reciente** relativo al intervalo declarado.

### 10.3 Vista pública vs. operador

- **Pública** (`GET /api/vigia/source-health/public`, sin auth): `{id, category, role, level}`, `level ∈ {available, degraded, unavailable}` — nunca error, duración, conteo, credenciales, URL.
- **Operador** (`GET /api/vigia/source-health/full`, `requireOperator()`): incluye `operationalStatus`, `statusReason`, `credentialsConfigured` (booleano, nunca el valor), `schedulerConfigured`, `intervalMinutes`, timestamps, `lastDurationMs`, `lastRecordCount`, `consecutiveFailures`, `errorCode`, `nextScheduledAt`, `consumer` — nunca secretos, tokens, URLs con clave embebida, payloads, ni stack traces. `endpoint` se omite deliberadamente del DTO de operador (el registro fuente es donde se audita, no hace falta en este endpoint).

Verificado por test: un secreto real inyectado en `process.env` durante el test nunca aparece serializado en ninguna de las dos vistas (Caso 19).

---

## 11. Credenciales

| Fuente | Variable | Estado hoy |
|---|---|---|
| NASA FIRMS | `NASA_FIRMS_MAP_KEY` | Configurada (Grupo A) |
| ReliefWeb | `RELIEFWEB_APP_NAME` | Configurada (Grupo A) |
| IOC SLSMF | `IOC_SLSMF_API_KEY` | **Ausente** → `missing_credentials` si se intentara ejecutar |
| OpenAQ | `OPENAQ_API_KEY` | **Ausente** |
| HDX HAPI | `HAPI_APP_IDENTIFIER` | **Ausente** |
| Copernicus GFM | `COPERNICUS_GFM_ACCESS_TOKEN` | **Ausente** |
| Copernicus GloFAS | `COPERNICUS_EWDS_API_KEY` | **Ausente** (y adaptador reclasificado a `stub`, ver §5.2 — irrelevante mientras no ejecute nunca) |
| NWS | `NWS_USER_AGENT` | Opcional (fallback con advertencia) |
| USGS Water | `USGS_WATER_API_KEY` | Opcional (solo eleva límite de tasa) |

Las cinco variables requeridas ausentes (IOC/OpenAQ/HAPI/GFM/EWDS) y las dos opcionales (NWS/USGS Water) más el UA compartido (`ARGUS_USER_AGENT`) se documentaron en `.env.example` en esta tarea — sin valores reales, solo para que quien configure el entorno sepa qué existe. Documentarlas no las activa: siguen en `executionMode: "manual"` o `"disabled"`.

---

## 12. Matriz final de fuentes (43 entradas)

Leyenda de Ejecución: **S**=scheduled, **M**=manual, **C**=context_only, **D**=disabled.

| Fuente | Rol | Ejecución | Scheduler | Estado final | Consumidor |
|---|---|---|---|---|---|
| usgs_earthquake | detection | S | 5 min | operational* | KnowledgeIncident |
| gdacs | detection | S | 15 min | operational* | KnowledgeIncident |
| nasa-eonet | detection | S | 30 min | operational* | KnowledgeIncident |
| nasa_firms | detection | S | 15 min | operational* | KnowledgeIncident (correlación incendios) |
| copernicus_effis | confirmation | S | 30 min | operational* | KnowledgeIncident (correlación incendios) |
| copernicus_ems | confirmation | S | 60 min | operational* | KnowledgeIncident (correlación incendios) |
| reliefweb | detection | S | 30 min | operational* | KnowledgeIncident |
| senapred_eventos | detection | S | 15 min (delegado) | operational* | KnowledgeIncident |
| dmc_meteochile_mention | enrichment | C | — | operational (contextual) | Evidencia adjunta |
| open-meteo | context | C | — | operational (contextual) | Contexto bajo demanda |
| news_evidence | context | M | — | configured_not_scheduled / manual_only** | Evidencia curada |
| nws | detection | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| noaa_coops | context | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| noaa_ncei_tsunami | historical | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| noaa_storm_events | historical | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| ioc_slsmf | enrichment | M | — | missing_credentials | Ninguno automático |
| openaq | context | M | — | missing_credentials | Ninguno automático |
| hdx_hapi | enrichment | M | — | missing_credentials | Ninguno automático |
| who_don | detection | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| ecdc | confirmation | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| copernicus_glofas | detection | D | — | **stub** (reclasificado, §5.2) | Ninguno |
| copernicus_gfm | detection | M | — | missing_credentials | Ninguno automático |
| smithsonian_gvp | detection | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| usgs_earthquake_impact | enrichment | M | — | configured_not_scheduled / manual_only** | Ninguno automático (enriquecería sismo existente) |
| openfema | historical | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| usgs_water | enrichment | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| usgs_volcano_hans | detection | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| osm_overpass | context | M | — | configured_not_scheduled / manual_only** | `/api/critical-pois/sync` bajo demanda |
| gdelt | context | M | — | configured_not_scheduled / manual_only** | Ninguno automático |
| conaset_chile | historical | D | — | stub | Ninguno |
| senapred_chile_knowledge_intake_stub | historical | D | — | stub | Ninguno |
| csb_global | historical | D | — | stub | Ninguno |
| iaea_global | detection | D | — | stub | Ninguno |
| ntsb_global | historical | D | — | stub | Ninguno |
| nhtsa_global | historical | D | — | stub | Ninguno |
| desinventar_global | historical | D | — | stub | Ninguno |
| emdat_global | historical | D | — | stub | Ninguno |
| csn_chile | confirmation | D | — | stub | Ninguno |
| shoa_chile | confirmation | D | — | stub | Ninguno |
| sernageomin_chile | confirmation | D | — | stub | Ninguno |
| mop_vialidad_chile | context | D | — | stub | Ninguno |
| dga_chile | context | D | — | stub | Ninguno |
| conaf_chile | confirmation | D | — | stub | Ninguno |

\* `operational` es el estado **típico** con ejecución exitosa reciente — el estado real y dinámico depende de la señal de `KnowledgeIngestionRun` en el momento de la consulta (puede leerse `degraded` tras fallos recientes).
\*\* `configured_not_scheduled` si nunca se invocó manualmente; `manual_only` desde la primera ejecución vía `/api/knowledge-intake/live/*` — la distinción es observable (¿existe algún intento registrado?), no un campo de intención adicional en el registro.

---

## 13. Rendimiento

- Una sola consulta acotada de historial (`getRecentIngestionRunsBySource`, 30 corridas) por corrida de Global Watch — nunca una consulta por fuente.
- Source Health dinámico usa una ventana de 400 corridas recientes agregada entre las ~43 fuentes — sesgada por recencia (las de mayor cadencia dominan la ventana), aceptado porque el objetivo es "estado actual", no historial completo por fuente (documentado como limitación conocida).
- El lock por fuente y el timeout externo acotan el costo por fuente individual sin bloquear las demás.

---

## 14. Archivos de esta tarea

**Nuevos** (adoptados de la sesión concurrente, ver §0):
- `src/lib/vigia/sourceOperationsRegistry.ts`
- `src/lib/vigia/sourceOperationsHealth.ts`
- `src/lib/vigia/sourceScheduler.ts`
- `src/app/api/vigia/source-health/public/route.ts`
- `src/app/api/vigia/source-health/full/route.ts`
- `tests/vigia/sourceOperationsRegistry.test.ts`
- `tests/vigia/sourceScheduler.test.ts`
- `tests/vigia/sourceScheduling.integration.test.ts`

**Nuevos, de esta tarea**:
- `docs/operations/ARGUS_SOURCE_OPERATIONS_BASELINE.md` (este documento)
- `docs/operations/ARGUS_SOURCE_ACTIVATION_BACKLOG.md`

**Modificados en esta tarea**:
- `src/lib/vigia/sourceOperationsRegistry.ts` — orden de precedencia stub/disabled (§5.1), reclasificación GloFAS (§5.2), parámetro `_now` no usado eliminado de `toOperatorSourceHealth`.
- `src/lib/vigia/sourceOperationsHealth.ts` — actualizado el call site tras el cambio de firma anterior.
- `tests/vigia/sourceOperationsRegistry.test.ts` — call sites actualizados tras el cambio de firma.
- `tests/vigia/sourceScheduling.integration.test.ts` — casts `as never` en fixtures de mocks para satisfacer `tsc --noEmit` (los tests ya pasaban en runtime; el defecto era solo de tipos).
- `.env.example` — variables de credenciales de fuentes Grupo B documentadas (sin valores).

**Adoptado sin cambios** (ya integrado en `globalWatchEngine.ts` por la sesión concurrente): vencimiento por fuente, lock por fuente, timeout por adaptador — todos wireados en el bucle principal de `runGlobalWatch()`.

Ningún otro archivo productivo fue tocado. `prisma/schema.prisma` sin diff. Sin commit, sin push, sin despliegue.
