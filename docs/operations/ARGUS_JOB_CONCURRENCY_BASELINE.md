# ARGUS — Baseline de Concurrencia de Jobs

**Fecha**: 2026-07-14
**Tipo**: implementación de infraestructura — locks distribuidos, idempotencia y recuperación segura para los pipelines programados de ARGUS.
**Alcance**: no se modificó `prisma/schema.prisma`, no se crearon migraciones, no se creó una tabla de jobs, no se cambiaron adaptadores/severidad/deduplicación semántica/modelo canónico/módulos, no se hizo commit ni push, no se disparó ningún workflow real.

---

## 1. Problema que corrige

`runGlobalWatch()` y `promoteChileOfficialAlerts()` (usada tanto por el pipeline de Chile Alerts como por la fuente SENAPRED de Global Watch) dependían únicamente de `upsert` por `externalId` + deduplicación posterior + reintentos de GitHub Actions para tolerar ejecuciones repetidas. Nada impedía que **dos ejecuciones simultáneas** del mismo pipeline (cron solapado con manual, o un reintento mientras la corrida anterior seguía viva) consultaran las fuentes dos veces, escribieran en distinto orden, o corrieran el lifecycle sweep dos veces a la vez. Además, se confirmó que `runGlobalWatch()` (vía su fuente `senapred_eventos`) y `/api/chile-alerts/run` llaman **la misma función** (`promoteChileOfficialAlerts`), sobre los mismos `externalId` — un solapamiento entre ambos pipelines podía hacer que ambos escribieran las mismas filas de `KnowledgeIncident` al mismo tiempo.

## 2. Pipelines protegidos y disparadores

| Pipeline | Disparador | Auth | Frecuencia | Reintentos | Riesgo anterior |
|---|---|---|---|---|---|
| Global Watch | Cron (GitHub Actions → `/api/jobs/run-global-watch`) | `Bearer CRON_SECRET` | ~15 min | curl `--retry 2` | Alto |
| Global Watch | Manual (`/api/vigia/run`, Command Center) | Sesión operador/admin + rate limit | Eventual | — | Alto |
| Chile Alerts | Cron (GitHub Actions → `/api/jobs/run-chile-alerts`) | `Bearer CRON_SECRET` | ~15 min | curl `--retry 2` | Alto |
| Chile Alerts | Manual (`/api/chile-alerts/run`) | Sesión operador/admin + rate limit | Eventual | — | Alto |
| SENAPRED (compartido) | Sub-paso de Global Watch **y** de Chile Alerts | Heredada del pipeline que lo invoca | Coincide con ambos | — | Alto (mismo `externalId`, dos escritores) |

No se encontraron otros disparadores de estos pipelines (`workflow_dispatch` reutiliza el mismo endpoint HTTP, no un camino de código distinto).

## 3. Arquitectura del lock

```text
Endpoint (route.ts)
  → validar secreto (cron) / sesión + rate limit (manual)
  → resolveIdempotencyKey()         ← src/lib/jobs/runIdentity.ts
  → acquireJobLock({ name, runId }) ← src/lib/jobs/jobLock.ts
      → determineRateLimitBackendKind()  (reutilizado del Prompt 12, sin segundo proveedor)
      → SET key runId NX PX ttlMs        ← src/lib/jobs/jobLockBackend.ts (distribuido)
        | Map en memoria (solo dev/test)
  → responseForJobLockResult() → 409 | 503 | null (continuar)
  → ejecutar pipeline
  → try/finally: lock.release() (Lua compare-and-delete, solo si el token coincide)
```

- **Backend**: Upstash Redis REST, el mismo cliente cacheado que el rate limiter del Prompt 12 (`getUpstashClient()` ahora exportado desde `src/lib/security/rateLimitBackend.ts`) — un solo proveedor distribuido para todo el proyecto.
- **Operación atómica de adquisición**: `SET key value NX PX ttlMs` (nunca `GET` + `SET` separados).
- **Token de propietario**: el `runId` de la corrida. Liberación y renovación usan scripts Lua (`EVAL`) que comparan el valor almacenado contra el token antes de `DEL`/`PEXPIRE` — atómico, así que una ejecución nunca puede liberar o renovar el lock de otra (Prompt 13 §11).
- **Claves** (una por pipeline, Prompt 13 §6):
  ```text
  argus:job-lock:global-watch
  argus:job-lock:chile-alerts
  argus:job-lock:senapred-ingestion   ← compartida entre los dos pipelines
  ```

### Tabla de locks

| Pipeline | Lock | TTL | Idempotency key | Failure mode |
|---|---|---:|---|---|
| Global Watch (cron + manual) | `argus:job-lock:global-watch` | 9 min | `Idempotency-Key` / `X-Argus-Run-Id`, o generada | fail_closed → 503 |
| Chile Alerts (cron + manual) | `argus:job-lock:chile-alerts` | 5 min | `Idempotency-Key` / `X-Argus-Run-Id`, o generada | fail_closed → 503 |
| SENAPRED (sub-sección compartida) | `argus:job-lock:senapred-ingestion` | 5 min | runId heredado del pipeline que lo invoca | degradación a `skipped` (ver §6) |

### TTL — justificación

- **Global Watch**: `maxDuration = 300` (5 min, límite duro de Vercel) declarado en `/api/jobs/run-global-watch` y `/api/vigia/run`. TTL de 9 min deja ~4 min de margen sobre el peor caso absoluto, y sigue siendo muy inferior al intervalo de 15 min entre corridas — una caída abrupta se recupera sola mucho antes de la siguiente corrida programada.
- **Chile Alerts / SENAPRED**: sin `maxDuration` explícito declarado (usa el límite por defecto de la plataforma, menor que 5 min); la duración observada del pipeline (fetch + clasificar + upsert de un lote pequeño de alertas) es de segundos. TTL de 5 min es generoso incluso contemplando un timeout de red completo.

### Renovación

**No se implementó renovación automática en los endpoints.** `maxDuration` (o el límite por defecto de la plataforma, para Chile Alerts/SENAPRED) es siempre menor que el TTL de cada lock, así que ninguna ejecución legítima puede acercarse a expirar su lock antes de terminar. `renew()` existe en el `JobLockHandle` (implementado, testeado con owner correcto/incorrecto — Caso 6) para disponibilidad futura si se agrega un pipeline de mayor duración, pero ningún endpoint lo invoca hoy. Decisión documentada explícitamente per Prompt 13 §10.

## 4. Identidad de corrida e idempotencia

- **`runId`**: `crypto.randomUUID()` generado internamente cuando el llamador no provee uno.
- **Idempotency key del llamador**: header `Idempotency-Key` (estándar) o `X-Argus-Run-Id` (alias propio de ARGUS) — el primero presente gana. Validado (longitud ≤200, charset `[A-Za-z0-9_.:-]`) antes de usarse; inválido → `400`, nunca se adquiere el lock. Nunca se usa como autorización.
- **El `runId`/idempotency key se usa como token del lock** — esto es lo que hace que "reintentos de la misma corrida no dupliquen ejecución" (Prompt 13 §7, Caso 9): mientras la corrida original sigue viva, un reintento con la misma clave intenta adquirir la MISMA clave de lock y recibe `already_running` igual que cualquier otro intento concurrente, sin necesitar una tabla de idempotencia separada (explícitamente fuera de alcance — "no cree una tabla de jobs en esta fase").
- **Reintentos después de que la corrida original ya terminó y liberó su lock**: se ejecuta el pipeline de nuevo — esto es correcto (curl solo reintenta tras un fallo real: 408/429/500/502/503/504, nunca tras un 200), y la idempotencia de **datos** la sigue proveyendo el `upsert`-por-`externalId` ya existente (`upsertKnowledgeIncidentByExternalId`, `saveKnowledgeEvidenceIfNew`) — el lock resuelve concurrencia, no sustituye esa idempotencia (Prompt 13 §18).

## 5. Estados de resultado y respuestas HTTP

```text
success | partial_success | failed | already_running
```

- **200** con el resumen estructurado (`GlobalWatchSummary` / resultado de `runChileAlertsIngestion`) para `success`/`partial`/`skipped_senapred_lock`.
- **409 Conflict** — `{"status":"already_running","pipeline":"<nombre>","retryable":true}` — se eligió 409 sobre 423 Locked por ser más ampliamente soportado/entendido por clientes HTTP y por el propio `curl` (Prompt 13 §12, política única).
- **503** — backend distribuido requerido y no disponible; la operación protegida nunca se ejecuta (fail closed, Prompt 13 §21). Aplica a cron y manual, a ambos pipelines.
- **400** — idempotency key inválida (formato/longitud), antes de intentar el lock.
- **401/403** — secreto de cron incorrecto/ausente, o sesión/rol insuficiente (manual) — nunca adquiere el lock.
- **429** — rate limit manual (Prompt 12) excedido — nunca adquiere el lock ni ejecuta el pipeline.
- **502** — el pipeline lanzó un error después de adquirir el lock; el lock se libera igual (`finally`).

## 6. Relación Global Watch ↔ Chile Alerts (SENAPRED)

**Confirmado por lectura directa del código**: `runSenapredSource()` dentro de `runGlobalWatch()` (fuente `senapred_eventos`) y `runChileAlertsIngestion()` (usada por `/api/chile-alerts/run` y `/api/jobs/run-chile-alerts`) llaman **ambas** a `promoteChileOfficialAlerts()` (`src/lib/incidents/alertPromotionEngine.ts`), que hace `upsert` sobre `KnowledgeIncident` usando el mismo esquema de `externalId` (`threat:area:date`). Es decir: mismo backend SENAPRED, mismos identificadores externos, dos escritores independientes.

**Decisión: Opción B — lock secundario compartido** (`argus:job-lock:senapred-ingestion`), aplicado exactamente alrededor de la llamada a `promoteChileOfficialAlerts()` en ambos call sites — no alrededor de todo el pipeline de ninguno de los dos. Razón técnica:
- Los dos pipelines **sí** pueden correr simultáneamente para todo lo que NO es SENAPRED (USGS, GDACS, FIRMS, etc. vs. la ingesta de alertas chilenas) — fusionar sus locks primarios sería una restricción innecesaria (Global Watch procesando FIRMS no tiene ninguna razón para bloquear a Chile Alerts).
- Solo la sección crítica específica (la llamada compartida) necesita exclusión mutua.
- No se fusionaron los pipelines ni se resolvió la duplicación de raíz (dos implementaciones que persiguen el mismo dato) — eso queda documentado como riesgo pendiente (§9), tal como exige el mandato ("no resuelva todavía toda la duplicación SENAPRED").

Cuando el lock `senapred-ingestion` no se puede adquirir:
- Dentro de Global Watch: la fuente `senapred_eventos` se marca `status: "skipped"` con una advertencia explicativa — el resto de las fuentes de esa corrida se procesan normalmente, la corrida completa no falla por esto.
- Dentro de Chile Alerts: el resultado completo tiene `status: "skipped_senapred_lock"` (still `200 OK` — no es un error, es una condición esperada de solapamiento legítimo) con un mensaje explicativo; no se llama a `fetchChileOfficialAlertsRaw`/`promoteChileOfficialAlerts`.

## 7. Comportamiento de los workflows

`.github/workflows/argus-cron.yml` y `argus-global-watch.yml` ahora:
- Envían `X-Argus-Run-Id: argus-<job>-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}` — estable entre los reintentos internos de `curl` de la misma ejecución del step (mismo `run_id`/`run_attempt`), y siempre nuevo en cada disparo programado o `workflow_dispatch` (GitHub garantiza `run_id` único por invocación).
- Capturan el código HTTP explícitamente (`-w "%{http_code}"`) en vez de usar `-f` (que solo permite éxito/fallo binario).
- **409** → el step termina con éxito (`exit 0`) y un mensaje informativo — un solapamiento legítimo con otra corrida no es un fallo del workflow.
- **2xx** → éxito normal.
- Cualquier otro código → el step falla (`exit 1`), imprimiendo el cuerpo de la respuesta para diagnóstico.
- `curl --retry 2` (sin `--retry-all-errors`) solo reintenta automáticamente 408/429/500/502/503/504 — nunca 409/401/400, evitando la "tormenta de reintentos" contra un job ya activo (Prompt 13 §13).
- No se imprime el header `Authorization` en ningún punto; el cuerpo de la respuesta de los endpoints de job nunca incluye secretos.
- La frecuencia (`cron: "3,18,33,48..."` / `"7,22,37,52..."`) **no se modificó** — no había evidencia que justificara cambiarla.

## 8. Observabilidad

Eventos de lock (`src/lib/jobs/jobLock.ts`, `console.info`):
```text
job_lock_acquired
job_lock_contended
job_lock_renewed / job_lock_renew_failed
job_lock_released / job_lock_release_failed
job_lock_backend_unavailable
```
Eventos de job:
```text
job_started
job_completed
job_partial
job_failed
```
Todos incluyen únicamente `pipeline`/`lock`, `backend`, `env`, y (para eventos de job) `durationMs`/`sourcesConsulted` — nunca el token del lock, el `runId` completo, secretos, cookies o payloads.

## 9. Procedimiento ante un lock atascado

Dado que no existe todavía una tabla de jobs ni un panel de administración de locks (explícitamente fuera de alcance de esta fase):

1. **Diagnóstico**: un lock atascado solo puede persistir hasta su TTL (9 min Global Watch, 5 min Chile Alerts/SENAPRED) — después de ese tiempo se libera solo, sin intervención. Si las corridas programadas siguen devolviendo `already_running` por más de ese intervalo, hay un problema real (proceso colgado indefinidamente sin llegar a `maxDuration`, o un reloj de servidor desincronizado).
2. **Verificación**: confirmar en los logs de Vercel/función si hay una invocación anterior todavía "en curso" según sus propios logs de `job_started` sin `job_completed`/`job_failed` correspondiente.
3. **Recuperación manual**: esperar a que expire el TTL (más simple y seguro) es la vía recomendada — no se expone un endpoint de "forzar liberación" en esta fase (agregar uno sin autenticación fuerte adicional sería una superficie de abuso; se deja como trabajo futuro documentado).
4. **Si es urgente**: un operador con acceso directo al backend Upstash puede borrar la clave manualmente (`DEL argus:job-lock:<pipeline>`) — acción de infraestructura fuera del alcance de este código, mencionada aquí solo como referencia operativa.

## 10. Archivos relevantes

```text
src/lib/jobs/jobLock.ts                 — helper central, reglas de TTL, respuestas HTTP, logging
src/lib/jobs/jobLockBackend.ts          — primitivas atómicas (Upstash SET NX PX + Lua release/renew, memoria dev/test)
src/lib/jobs/runIdentity.ts             — runId + validación de idempotency key
src/lib/security/rateLimitBackend.ts    — getUpstashClient() ahora exportado y reutilizado (un solo proveedor)
src/lib/vigia/globalWatchEngine.ts      — runId propagado a logs/resumen; lock senapred-ingestion en runSenapredSource
src/app/api/jobs/run-global-watch/route.ts
src/app/api/vigia/run/route.ts
src/app/api/chile-alerts/run/route.ts   — runChileAlertsIngestion() adquiere el lock senapred-ingestion
src/app/api/jobs/run-chile-alerts/route.ts
.github/workflows/argus-cron.yml
.github/workflows/argus-global-watch.yml
tests/jobs/jobLock.test.ts              — casos de helper (concurrencia, TTL, propietario, renovación, backend)
tests/jobs/jobLockEndpoints.test.ts     — casos de endpoint (lock↔motor, auth, rate limit, SENAPRED compartido)
```
