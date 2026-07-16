# ARGUS — Runbooks operacionales

> Prompt 19 §35. Ningún runbook incluye secretos. Cada uno referencia
> `GET /api/operations/health` (nuevo) y/o `GET /api/vigia/source-health/full`
> (existente) como primer paso — nunca pide revisar código manualmente como
> primer paso. Los IDs entre backticks (p. ej. `` `lock-atascado` ``) son los
> mismos que usa `RUNBOOK_BY_EVENT` en `src/lib/observability/operationsSnapshot.ts`
> y aparecen como enlace en el panel `/admin/operations` cuando corresponden
> a un problema activo.

## `global-watch-no-ejecuta` — 1. Global Watch no ejecuta

- **Síntomas**: sin incidentes nuevos globales en el mapa; `/admin/source-health` no muestra corridas recientes para fuentes VIGÍA.
- **Indicadores**: `GET /api/operations/health` → `pipelines[].pipeline === "global-watch"` con `status: "degraded"` o `"unknown"`; `lastSuccessAt` vencido respecto a `freshnessWindowMinutes`.
- **Comprobaciones**: revisar Actions de `.github/workflows/argus-global-watch.yml` (¿corrió? ¿falló? ¿409 repetido?); `GET /api/vigia/source-health` para ver si alguna fuente individual sí corrió recientemente.
- **Causa probable**: `CRON_SECRET`/`ARGUS_CRON_SECRET` desincronizados, lock atascado (ver runbook de lock), o el workflow de GitHub Actions deshabilitado/fallando antes del `curl`.
- **Acción segura**: disparar manualmente `POST /api/vigia/run` (requiere sesión de operador) para confirmar que el pipeline en sí funciona fuera del cron.
- **Criterio de recuperación**: una corrida manual o programada completa con `status: "success"` o `"partial"` y `pipelines[].status` vuelve a `healthy`.
- **Cuándo escalar**: si una corrida manual también falla, o si `CRON_SECRET` no coincide entre GitHub Secrets y el entorno de despliegue.
- **Prohibido**: deshabilitar el lock, reducir su TTL, o exponer `CRON_SECRET` en logs para depurar.

## `chile-alerts-no-ejecuta` — 2. Chile Alerts no ejecuta

- **Síntomas**: sin alertas SENAPRED nuevas; `/api/chile-alerts` devuelve el mismo conjunto desde hace horas.
- **Indicadores**: `pipelines[].pipeline === "chile-alerts"` con `status` degradado en `/api/operations/health`.
- **Comprobaciones**: Actions de `.github/workflows/argus-cron.yml`; disparar manualmente `POST /api/chile-alerts/run`.
- **Causa probable**: mismas que Global Watch, más: lock compartido `senapred-ingestion` contendido por una corrida de Global Watch simultánea (esperado bajo carga, no un fallo si se resuelve solo).
- **Acción segura**: reintentar manualmente después de 5 min (TTL del lock `senapred-ingestion`).
- **Criterio de recuperación**: corrida exitosa reciente, `pipelines[].status: "healthy"`.
- **Cuándo escalar**: contención persistente por más de 15 min (3 ciclos de cron) sin resolverse sola.
- **Prohibido**: forzar liberación manual del lock desde este runbook (no hay botón para eso en el panel a propósito — ver §29).

## `fuente-oficial-degradada` — 3. Fuente oficial degradada

- **Síntomas**: una fuente marcada `isOfficial: true` en el registro aparece `degraded`/`broken` en `/admin/source-health` o `GET /api/vigia/source-health/full`.
- **Indicadores**: `sources.degraded`/`sources.broken` &gt; 0 en `/api/operations/health`; `consecutiveFailures` creciente para esa fuente.
- **Comprobaciones**: `statusReason`/`errorCode` de la fuente en `/api/vigia/source-health/full` (nunca el mensaje crudo del proveedor, solo el código normalizado).
- **Causa probable**: cambio de contrato del proveedor externo, credencial vencida (`missing_credentials`), o degradación de red.
- **Acción segura**: forzar una corrida manual de esa fuente vía `/admin/source-health` ("Forzar actualización").
- **Criterio de recuperación**: `consecutiveFailures` vuelve a 0 y `operationalStatus` vuelve a `operational`.
- **Cuándo escalar**: `broken` sostenido por &gt;1 hora en una fuente oficial, o `missing_credentials` (requiere rotar/configurar credenciales, fuera del alcance de este runbook).
- **Prohibido**: desactivar la fuente en el registro sin autorización — eso es un cambio funcional, no operacional.

## `redis-no-disponible` — 4. Backend Redis/Upstash no disponible

- **Síntomas**: nuevas corridas de job fallan con `SERVICE_UNAVAILABLE` (503); rate limiting cae a modo memoria o fail-closed.
- **Indicadores**: `distributedBackend.status: "unavailable"` (producción) en `/api/operations/health`.
- **Comprobaciones**: estado del proyecto Upstash; variables `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` presentes y válidas.
- **Causa probable**: outage de Upstash, credenciales rotadas sin actualizar el entorno de despliegue.
- **Acción segura**: ninguna acción de código — es un problema de proveedor externo o configuración de entorno.
- **Criterio de recuperación**: `distributedBackend.status` vuelve a `healthy`.
- **Cuándo escalar**: inmediatamente si dura más de 15 min en producción (bloquea todo nuevo lock de job y rate limiting distribuido).
- **Prohibido**: cambiar el fail-closed a fail-open en producción para "seguir funcionando" — el diseño existente es deliberado (Prompt 12/13).

## `db-inaccesible` — 5. Base de datos inaccesible

- **Síntomas**: prácticamente todo falla (login, mapa, notificaciones, panel).
- **Indicadores**: `persistence.status: "unavailable"` en `/api/operations/health`, que además retorna `overallStatus: "unavailable"` de inmediato (componente crítico).
- **Comprobaciones**: estado de Supabase/Postgres; `DATABASE_URL`/`DIRECT_URL`.
- **Causa probable**: outage del proveedor de base de datos, pool de conexiones agotado, credencial rotada.
- **Acción segura**: ninguna desde la aplicación — problema de infraestructura externa.
- **Criterio de recuperación**: `persistence.status: "healthy"`.
- **Cuándo escalar**: inmediatamente — es el componente más crítico del sistema.
- **Prohibido**: cualquier operación de escritura/migración como "solución" mientras la base está inestable.

## `lock-atascado` — 6. Lock atascado

- **Síntomas**: todas las corridas (manuales y programadas) de un pipeline devuelven 409 `already_running` de forma persistente, mucho más allá del TTL esperado.
- **Indicadores**: contención repetida en `job_lock_contended` (logs), sin ninguna corrida real completándose.
- **Comprobaciones**: TTLs documentados en `src/lib/jobs/jobLock.ts` (`jobLockRules`) — 9 min Global Watch, 5 min Chile Alerts/SENAPRED. Un lock atascado más allá de 2× su TTL es anómalo.
- **Causa probable**: una corrida murió sin liberar el lock (timeout duro de la plataforma serverless antes de que el `finally`/`release()` corriera) — el lock igual expira solo por `PX` (TTL nativo de Redis), así que normalmente se autorresuelve.
- **Acción segura**: esperar el TTL (máximo 9 min); si persiste después de 2× el TTL, es evidencia de un backend distribuido con estado inconsistente (ver runbook 4).
- **Criterio de recuperación**: la siguiente corrida programada adquiere el lock normalmente.
- **Cuándo escalar**: contención sostenida por &gt;20 min sin ninguna corrida exitosa.
- **Prohibido**: liberar el lock manualmente vía comandos directos a Redis fuera de este proceso — el diseño usa tokens de propietario (Lua compare-and-delete) precisamente para que solo el dueño legítimo lo libere; forzarlo puede permitir dos corridas concurrentes.

## `incremento-descartes-geograficos` — 7. Incremento de descartes geográficos

- **Síntomas**: `projectionDroppedCount` &gt; 0 de forma sostenida en `/api/vigia/events` o `/api/chile-alerts`.
- **Indicadores**: eventos `map_projection_dropped` en `recentIssuesBuffer`/`activeIssues`.
- **Comprobaciones**: revisar si una fuente específica está persistiendo `KnowledgeIncident` sin `latitude`/`longitude` ni geometría válida — correlacionar con `sourceId` en el log agregado.
- **Causa probable**: cambio de formato en el proveedor de una fuente, bug de normalización en un adaptador (fuera de alcance corregir aquí — ver `docs/operations/ARGUS_SOURCE_OPERATIONS_BASELINE.md`).
- **Acción segura**: documentar la fuente afectada; no hay acción de mitigación en este pase (los descartes por geometría inválida son un resultado *correcto* — nunca se debe inventar una coordenada).
- **Criterio de recuperación**: `projectionDroppedCount` vuelve a 0 en solicitudes nuevas.
- **Cuándo escalar**: si una fuente oficial de alta prioridad es la que está descartando sistemáticamente.
- **Prohibido**: sustituir coordenadas faltantes con una ubicación por defecto/centroide del país para "arreglar" el conteo.

## `incidente-critico-no-aparece-en-mapa` — 8. Incidente crítico no aparece en mapa

- **Síntomas**: un incidente que se sabe crítico/oficial no aparece en `/app`.
- **Comprobaciones**: buscar el incidente por `sourceId`/`externalId` en `/api/vigia/events` o `/api/chile-alerts` directamente (¿aparece en `events`? ¿se contó en `projectionDroppedCount`? ¿fue excluido por lifecycle vía `logUnrecognizedLifecycle`?).
- **Causa probable**: geometría no resoluble (drop real, ver runbook 7), lifecycle no reconocido (excluido por seguridad, fail-closed), o filtro de demo (`isDemo` sin `includeDemo=true`).
- **Acción segura**: ninguna automática — confirmar cuál de las tres causas aplica antes de actuar.
- **Criterio de recuperación**: el incidente aparece en la respuesta del endpoint correspondiente.
- **Cuándo escalar**: si es geometría válida y lifecycle reconocido pero aun así no aparece — posible bug de proyección, no solo de datos.
- **Prohibido**: modificar `KnowledgeIncident.latitude`/`longitude` manualmente en la base para "forzar" que aparezca.

## `incidente-critico-sin-notificacion` — 9. Incidente crítico no genera notificación

- **Síntomas**: incidente crítico/oficial visible en el mapa pero ausente de la campana de notificaciones.
- **Indicadores**: eventos `notification_source_fetch_failed` con `detail.source: "critical_knowledge_incidents"` en `activeIssues` — el gap de mayor riesgo identificado en este prompt.
- **Comprobaciones**: `GET /api/notifications` directamente; revisar si `getCriticalKnowledgeIncidents()` está fallando (antes de este prompt, fallaba en silencio — ahora queda registrado).
- **Causa probable**: fallo transitorio de Prisma en esa consulta específica, o el incidente no cumple `severity ∈ {high, critical}` pese a parecer crítico en el mapa (revisar el valor exacto persistido).
- **Acción segura**: reintentar `GET /api/notifications`; si el fallo es de base de datos, ver runbook 5.
- **Criterio de recuperación**: el incidente aparece en la respuesta de `/api/notifications`.
- **Cuándo escalar**: inmediatamente si se confirma que un incidente P0 real no generó notificación.
- **Prohibido**: crear una notificación manual/sintética como parche sin corregir la causa raíz.

## `mapa-orbit-conteos-distintos` — 10. Mapa y Orbit muestran conteos distintos

- **Síntomas**: el globo 3D (Orbit) y el mapa 2D muestran números diferentes de eventos.
- **Comprobaciones**: ambos consumen el mismo estado `argusEvents` en `src/app/app/page.tsx` (mismo array, sin filtrado independiente por capa) — si divergen, es un bug de renderizado en uno de los dos componentes (`ArgusEventLayer` vs. `GlobeView`), no de datos.
- **Causa probable**: un filtro de capa (`layerState.ts`) aplicado solo a una de las dos vistas, o un fallo de renderizado silencioso en una de ellas.
- **Acción segura**: comparar el conteo mostrado contra `events.length` de la respuesta cruda de `/api/vigia/events`+`/api/chile-alerts` (fuente de verdad).
- **Criterio de recuperación**: ambas vistas muestran el mismo conteo que la fuente de verdad.
- **Cuándo escalar**: si la divergencia es sistemática (no un parpadeo puntual durante una recarga).
- **Prohibido**: N/A — no hay acción destructiva posible aquí.

## `modulo-sin-contexto-canonico` — 11. Módulo no puede cargar contexto canónico

- **Síntomas**: ATLAS/VIGÍA/ORÁCULO/TALOS muestran "datos no disponibles" pese a que el mapa funciona.
- **Indicadores**: eventos `module_gateway_query_failed` en `activeIssues`, componente `canonical_incident_gateway`.
- **Comprobaciones**: `GET /api/modules/incidents` directamente; el gateway (`canonicalIncidentGateway.ts`) ya no falla en silencio — el log incluye `operation: "list"|"by_id"` y, si aplica, `incidentId`.
- **Causa probable**: fallo de Prisma en esa consulta específica (ver runbook 5 si es sistémico) o un filtro/paginación mal formado desde el módulo llamador.
- **Acción segura**: reintentar; si persiste, revisar si `persistence.status` también está degradado (correlación).
- **Criterio de recuperación**: el módulo vuelve a mostrar datos.
- **Cuándo escalar**: si `persistence.status: "healthy"` pero el gateway sigue fallando — apunta a un bug específico del gateway, no de infraestructura.
- **Prohibido**: hacer que el módulo consulte Prisma directamente como workaround — rompe la regla de "un solo punto de entrada" (Prompt 17).

## `source-health-desconocido` — 12. Source Health declara estado desconocido

- **Síntomas**: una fuente aparece con estado `unknown`/sin evidencia suficiente en vez de un estado concreto.
- **Comprobaciones**: `deriveSourceOperationalStatus()` nunca produce literalmente `"unknown"` (su taxonomía no incluye ese valor — ver `SourceOperationalStatus` en `sourceOperationsRegistry.ts`); si el panel de operaciones muestra `sources.status: "unknown"`, es porque `getSourceOperationsHealth()` devolvió una lista vacía (`total: 0`), no porque una fuente individual esté "perdida".
- **Causa probable**: fallo al consultar `KnowledgeIngestionRun` (ver runbook 5) durante el cálculo del rollup, o el registro de fuentes está vacío (no debería ocurrir salvo error de despliegue).
- **Acción segura**: reintentar `GET /api/operations/health`; comparar contra `GET /api/vigia/source-health/full` (fuente independiente de verdad para el detalle por fuente).
- **Criterio de recuperación**: `sources.total &gt; 0` y `sources.status` refleja un rollup real.
- **Cuándo escalar**: si `/api/vigia/source-health/full` también falla — apunta a un problema de base de datos, no del rollup nuevo.
- **Prohibido**: reportar `sources.status: "healthy"` cuando `total === 0` — el código ya está escrito para nunca hacer esto; si se observa lo contrario, es un bug a corregir, no un comportamiento a silenciar.
