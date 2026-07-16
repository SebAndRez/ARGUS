# ARGUS — Baseline de observabilidad

> Prompt 19. Este documento no declara que ARGUS tiene un stack de
> observabilidad de nivel proveedor externo — declara qué existe, qué se
> consolidó, y qué sigue siendo un log/snapshot en vivo en vez de historial
> almacenado. Ver `docs/operations/ARGUS_SOURCE_OPERATIONS_BASELINE.md` para
> el registro de fuentes (sin cambios aquí) y
> `docs/modules/ARGUS_SECONDARY_MODULE_STABILIZATION.md` para el eje de
> madurez de HERMES/ARCA/AURA/CUSTOS/NEXUS (independiente de este trabajo).

## 1. Arquitectura

```
scheduler (GitHub Actions)
  → job endpoint (/api/jobs/run-*, /api/vigia/run, /api/chile-alerts/run)
    → job lock (src/lib/jobs/jobLock.ts, Upstash/memoria)
      → fuente (src/lib/vigia/sourceScheduler.ts, lock + KnowledgeIngestionRun)
        → normalización/persistencia (knowledgePersistenceService.ts)
          → proyección canónica (canonicalKnowledgeIncidentToArgusEvent.ts)
            → mapa (/api/vigia/events, /api/chile-alerts) y módulos (canonicalIncidentGateway.ts)
              → notificaciones (/api/notifications)
```

Ya existía instrumentación real en varios puntos de esta cadena (locks,
rate limiting, Source Health) — este prompt no la reemplaza, la consolida
y cierra los puntos donde una falla no dejaba ningún rastro.

## 2. Logging

- **Loggers preexistentes, sin tocar** (ya probados, mismo formato
  `[argus:tag] evento clave=valor` vía `console.info`/`console.warn`):
  `logJobLockEvent`/`logJobEvent` (`src/lib/jobs/jobLock.ts`),
  `logSourceLockEvent` (`src/lib/vigia/sourceScheduler.ts`),
  `logRateLimitEvent` (`src/lib/security/rateLimit.ts`),
  `logUnrecognizedLifecycle` (`src/lib/lifecycle/operationalVisibilityPolicy.ts`),
  `logWildfireEvent` (`src/lib/vigia/wildfireCorrelationEngine.ts`).
- **Logger central nuevo**: `logOperationalEvent()`
  (`src/lib/observability/operationalEvents.ts`) — formato estructurado JSON
  de una línea (`timestamp`, `level`, `event`, `component`, `environment`,
  más `requestId`/`runId`/`sourceId`/`incidentId`/`moduleId`/`outcome`/
  `durationMs`/`count`/`errorCode`/`detail` opcionales). Es el estándar para
  instrumentación **nueva**; los loggers de arriba no se reescribieron para
  no arriesgar 3 suites de test ya verdes por un cambio puramente
  cosmético de formato. Ambos coexisten y están documentados juntos en
  `docs/operations/ARGUS_TELEMETRY_DICTIONARY.md`.
- Niveles: `debug` (silenciado en producción, igual que otros loggers
  `NODE_ENV`-gated del repo), `info`, `warn`, `error`. Eventos `warn`/`error`
  además alimentan `recentIssuesBuffer` (ver §5).

## 3. Redacción

`redactForLog()` (`src/lib/observability/redact.ts`) — redacción recursiva
por nombre de clave (case-insensitive), acotada en profundidad (4 niveles)
y tamaño de arreglo (50 ítems). Claves que disparan redacción:
`authorization, cookie, password, token, secret, apiKey, governmentId,
email, phone, medical`. Se aplica automáticamente a `detail` en
`logOperationalEvent()` — no depende de que cada llamador recuerde omitir
campos sensibles. Precedente generalizado: `sanitizeAuditPayload()` en
`src/lib/access/accessAudit.ts`, que hacía lo mismo a mano por campo.

## 4. Identificadores de correlación

- **`runId`** (corridas de job) — sin cambios, `src/lib/jobs/runIdentity.ts`
  (`generateRunId()` + `resolveIdempotencyKey()`, headers `Idempotency-Key`/
  `X-Argus-Run-Id`). Sigue siendo la única identidad de corrida.
- **`requestId`** (solicitudes HTTP genéricas) — nuevo,
  `src/lib/observability/requestId.ts` (`resolveRequestId()`, header
  `X-Request-Id`). Mismo patrón de validación que `runIdentity.ts`, pero no
  reemplaza esa identidad de job — son conceptos distintos que pueden
  coexistir en un mismo log.
- **`sourceId`/`incidentId`/`moduleId`** — ya existían como conceptos
  (registro de fuentes, `KnowledgeIncident.id`, `moduleId` del gateway
  canónico); ahora pueden viajar como campos del logger central.

## 5. Buffer de problemas recientes (no es almacenamiento histórico)

`src/lib/observability/recentIssuesBuffer.ts` — arreglo acotado (~200
entradas) **en memoria, por proceso**. `logOperationalEvent()` empuja ahí
cualquier evento `warn`/`error`. Se reinicia en cada cold start / nueva
instancia serverless — no está compartido entre instancias, no sobrevive un
redeploy, no es un sustituto de un backend de series temporales. Es lo que
alimenta `notifications`/`projections`/`modules` y `activeIssues` en
`GET /api/operations/health`. Documentado explícitamente para que nadie lo
confunda con historial configurado (Prompt 19 §46).

## 6. Salud operacional

- **Taxonomía nueva**: `OperationalHealthStatus` (`src/lib/observability/healthStatus.ts`)
  — `healthy | degraded | unavailable | misconfigured | disabled | unknown`.
  Es un nivel de agregación por encima de las taxonomías de grano fino ya
  existentes (`SourceOperationalStatus` de 10 valores, `ModuleContextLoadState`,
  etc.) — no las reemplaza ni las duplica.
- **Cálculo puro**: `computeOverallHealth(critical, important)` — precedencia
  documentada en el código y en `docs/operations/ARGUS_OPERATIONAL_SLO_BASELINE.md`.
  Componentes críticos: persistencia, plataforma (variables requeridas),
  frescura de Global Watch y Chile Alerts. Importantes: backend distribuido,
  fuentes (rollup de `getSourceOperationsHealth()`), notificaciones,
  proyección de mapa, módulos.
- **Snapshot**: `getOperationalHealthSnapshot()` (`src/lib/observability/operationsSnapshot.ts`)
  — la única función que hace I/O: un `SELECT 1` de persistencia, reutiliza
  `getSourceOperationsHealth()` (Prompt 16, sin cambios) y
  `getRecentIngestionRunsBySource()` (ya existente) para frescura de
  pipelines, y lee `recentIssuesBuffer` para notificaciones/proyección/
  módulos. No ejecuta jobs, no consulta fuentes externas, no inserta datos.

## 7. Endpoints

- `GET /api/health` — público, sin I/O, liveness únicamente
  (`{status, timestamp, version}`).
- `GET /api/operations/health` — protegido (`requireOperator()`), snapshot
  completo. Nunca responde 200 con un estado inventado si el cálculo falla
  (responde 503).
- No se tocaron `/api/vigia/source-health(/full|/public)`,
  `/api/firms/health` ni `/api/knowledge-intake/health` — siguen siendo las
  vistas detalladas por fuente.

## 8. Panel

`/admin/operations` (nuevo) — Server Component (`page.tsx`) que valida
`requireOperator`-equivalente server-side antes de renderizar cualquier
componente cliente (más estricto que el precedente `/admin/source-health`,
que es enteramente cliente). Cliente `OperationsPanel.tsx`: polling cada
45s, `AbortController` por solicitud, limpieza al desmontar, pausa cuando
`document.visibilityState === "hidden"`. `/admin/source-health` no se tocó.

## 9. Descartes silenciosos cerrados (adicional, sin cambiar comportamiento)

| Punto | Antes | Ahora |
|---|---|---|
| `src/app/api/notifications/route.ts` (6 funciones) | `catch { return []; }` sin log | Mismo `return []`, más `logOperationalEvent` antes de devolver |
| `src/lib/modules/canonicalIncidentGateway.ts` (2 funciones) | `catch { return {ok:false,...} }` sin log | Mismo contrato de retorno, más `logOperationalEvent` |
| `src/app/api/vigia/events/route.ts`, `chile-alerts/route.ts` | Geometría inválida se filtraba en silencio | Se cuenta `projectionDroppedCount` (solo fallos de proyección, no exclusiones esperadas por severidad/lifecycle/demo) y se expone como campo adicional en la respuesta + un log si `>0` |
| `src/app/api/auth/login/route.ts` | Fallos de login sin señal | `logOperationalEvent("auth_login_failed", ...)` sin email/contraseña |

**Deliberadamente no tocado** (documentado, no ignorado): los `catch`
internos de `globalWatchEngine.ts` (`createIngestionRun`,
`finishIngestionRun`, `sweepIncidentLifecycles`) y el `catch(() => null)`
por-alerta de `senapredProvider.ts`. Ese motor es complejo, ya probado
extensamente, y el prompt prohíbe cambiar algoritmos — instrumentar sus
catches internos es mayor riesgo que beneficio para este pase.

## 10. Limitaciones

- `recentIssuesBuffer` es por proceso: en un despliegue serverless con
  múltiples instancias, cada una tiene su propio buffer — el snapshot que
  ve un operador depende de qué instancia atendió esa solicitud. No hay
  agregación entre instancias.
- `notifications`/`projections`/`modules` no tienen una señal de éxito
  positiva equivalente a "corrida completada sin errores" (ejecutar
  verificaciones sintéticas para producir una está prohibido por §36) — se
  reportan `healthy` cuando el buffer de la última hora no registró ningún
  fallo (ausencia de problema conocido, no verificación activa) y
  `degraded` en cuanto se observa uno. Documentado explícitamente como una
  señal más débil que la de persistencia/fuentes (que sí verifican algo
  directamente).
- Sin backend de métricas persistente: nada de esto sobrevive un redeploy
  ni permite graficar tendencias históricas. Ver
  `docs/operations/ARGUS_TELEMETRY_DICTIONARY.md` para la distinción exacta
  entre "se emite como log" y "se puede consultar después".

## 11. Proveedores no instalados

Ninguno. No se agregó Datadog, Sentry, Prometheus, Grafana, New Relic ni
ningún backend de métricas/tracing de terceros. Toda la telemetría nueva es
`console.*` estructurado + un buffer en memoria — cero infraestructura
nueva, cero costos nuevos.
