# ARGUS — Diccionario de telemetría

> Prompt 19 §44. Todo lo listado aquí es un **log estructurado o un
> conteo calculado en el momento de la solicitud** — ninguno es una métrica
> almacenada con historial consultable después del hecho, salvo donde se
> indica explícitamente (`KnowledgeIngestionRun`, que sí es una tabla
> persistente y preexistente). Ver
> `docs/operations/ARGUS_OBSERVABILITY_BASELINE.md` §10 para las
> limitaciones completas.

## Eventos preexistentes (sin cambios en este prompt)

| Evento | Tipo | Componente | Campos | Propósito |
|---|---|---|---|---|
| `job_lock_acquired` / `job_lock_contended` / `job_lock_renewed` / `job_lock_renew_failed` / `job_lock_released` / `job_lock_release_failed` / `job_lock_backend_unavailable` | log (`console.info`) | `src/lib/jobs/jobLock.ts` | `lock`, `backend`, `env` | Ciclo de vida del lock de pipeline (Global Watch/Chile Alerts/SENAPRED) |
| `job_started` / `job_completed` / `job_partial` / `job_failed` | log (`console.info`) | `src/lib/jobs/jobLock.ts` | `pipeline`, `durationMs?`, `sourcesConsulted?`, `env` | Resultado de una corrida de pipeline |
| `source_lock_acquired` / `source_lock_contended` / `source_lock_released` / `source_lock_release_failed` / `source_lock_backend_unavailable` | log (`console.info`) | `src/lib/vigia/sourceScheduler.ts` | `sourceId`, `backend`, `env` | Lock por fuente individual dentro de Global Watch |
| `rate_limit_blocked` / `rate_limit_backend_error` / `rate_limit_backend_unavailable` | log (`console.warn`) | `src/lib/security/rateLimit.ts` | `policy`, `route`, `backend`, `env` | Bloqueo o fallo de rate limiting |
| `[argus:lifecycle] valor no reconocido...` | log (`console.warn`) | `src/lib/lifecycle/operationalVisibilityPolicy.ts` | `id`, `source`, `lifecycle` | Estado de lifecycle no reconocido, excluido fail-closed |
| `wildfire_candidate_found` / `wildfire_correlated` / `wildfire_not_correlated` / `wildfire_evidence_attached` / `wildfire_duplicate_suppressed` / `wildfire_correlation_ambiguous` | log (`console.info`) | `src/lib/vigia/wildfireCorrelationEngine.ts` | payload libre por evento | Motor de correlación de incendios |
| `KnowledgeIngestionRun` (fila persistida) | **tabla Prisma real** | `src/lib/knowledge-intake/persistence/knowledgePersistenceService.ts` | `sourceId`, `status`, `startedAt`, `finishedAt`, `recordsFetched/Normalized/Inserted/Updated/Skipped`, `errorMessage` | Único registro histórico real de ejecuciones por fuente — base de Source Health |

## Eventos nuevos (Prompt 19), vía `logOperationalEvent()`

| Evento | Nivel | Componente | Campos relevantes | Propósito |
|---|---|---|---|---|
| `notification_source_fetch_failed` | `error`/`warn` | `notifications` | `detail.source` (`reports_help_requests`\|`external_events`\|`critical_knowledge_incidents`\|`source_health`\|`vesta_reminders`\|`predictive_notifications`), `detail.message` | Cierra los 6 `catch{return[]}` silenciosos de `/api/notifications` — el de `critical_knowledge_incidents` es el de mayor riesgo (incidente crítico que podría no notificarse) |
| `module_gateway_query_failed` | `error` | `canonical_incident_gateway` | `errorCode: "DATA_UNAVAILABLE"`, `detail.operation` (`list`\|`by_id`), `incidentId?` | Antes silencioso: el gateway ya devolvía un error estructurado a sus llamadores, pero nada quedaba registrado |
| `map_projection_dropped` | `warn` | `map_projection` | `count`, `detail.source` (`vigia_events`\|`chile_alerts`), `detail.fetched` | Cuenta **solo** fallos reales de proyección (sin geometría resoluble) — nunca exclusiones esperadas por severidad/lifecycle/demo |
| `auth_login_failed` | `warn` | `security` | `errorCode` (`UNKNOWN_ACCOUNT`\|`BAD_PASSWORD`) | Nunca incluye email ni contraseña |
| `events_dropped_total` | `warn` | (el que llame `DropAggregator.logSummary`) | `count`, `detail` (mapa `DropReason → count`) | Helper genérico (`src/lib/observability/dropReasons.ts`) para futura instrumentación — un log agregado por corrida, nunca uno por registro |
| `operations_health_snapshot_failed` | `error` | `operations_health` | `detail.message` | Si `getOperationalHealthSnapshot()` falla, el endpoint responde 503 en vez de 200 con datos inventados |

## `DropReason` (vocabulario normalizado, `src/lib/observability/dropReasons.ts`)

`invalid_coordinates | invalid_geometry | missing_required_field |
lifecycle_terminal | expired | demo_blocked | duplicate |
correlated_into_existing | unsupported_type | unauthorized | rate_limited |
locked | insufficient_confidence | out_of_scope`

## Snapshot calculado (no es un evento, es un cálculo bajo demanda)

| Campo | Fuente | Frescura |
|---|---|---|
| `platform` | Presencia de `DATABASE_URL`/`AUTH_SECRET`/`CRON_SECRET` | Instantánea (sin I/O) |
| `persistence` | `SELECT 1` vía Prisma | Instantánea (una consulta) |
| `distributedBackend` | `determineRateLimitBackendKind()` (ya existente, sin I/O) | Instantánea |
| `pipelines[]` | `KnowledgeIngestionRun` (últimas 50 filas por conjunto de fuentes del pipeline) | Al momento de la solicitud |
| `sources` | `getSourceOperationsHealth()` (ya existente, últimas 400 filas por fuente) | Al momento de la solicitud |
| `notifications` / `projections` / `modules` | `recentIssuesBuffer` (última hora, en memoria) | Solo lo que este proceso observó |
| `activeIssues` | `recentIssuesBuffer`, deduplicado por `(component, event)` | Solo lo que este proceso observó en la última hora |

## Telemetría emitida ≠ almacenamiento histórico configurado

Explícito por instrucción del prompt (§46): nada de la tabla de "Eventos
nuevos" se almacena más allá de la línea de log y (para `warn`/`error`) el
buffer en memoria de 200 entradas por proceso. Un operador que necesite
"¿cuántos `auth_login_failed` hubo la semana pasada?" no puede responder
eso con lo construido aquí — necesitaría un backend de logs/métricas
externo, explícitamente fuera de alcance de este prompt.
