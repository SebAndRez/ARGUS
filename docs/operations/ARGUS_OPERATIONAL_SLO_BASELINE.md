# ARGUS — SLO operacionales (baseline provisional)

> Prompt 19 §33-34. Estos son objetivos internos de referencia, **no
> compromisos comerciales**, y no se declara cumplimiento de ninguno de
> ellos: no existe todavía una ventana histórica suficiente para medirlos
> (ver §"Limitaciones" al final). Sirven para que un futuro backend de
> métricas tenga contra qué comparar, y para que el panel `/admin/operations`
> sepa qué ventanas de frescura usar hoy.

## Componentes críticos vs. importantes (usado por `computeOverallHealth`)

| Tipo | Componente | Por qué |
|---|---|---|
| Crítico | Persistencia (Postgres/Prisma) | Sin base de datos no hay incidentes, refugios, sesiones ni nada persistente. |
| Crítico | Plataforma (variables requeridas: `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`) | Su ausencia es una falla de configuración, no operacional — merece su propio estado (`misconfigured`). |
| Crítico | Frescura de Global Watch | Pipeline principal de detección global. |
| Crítico | Frescura de Chile Alerts | Pipeline principal de alertas oficiales chilenas. |
| Importante | Backend distribuido (Upstash Redis) | Sin él, los locks de job fallan cerrado (bloquean nuevas corridas) pero el mapa/notificaciones ya persistidos siguen sirviendo — degrada, no tumba la plataforma. |
| Importante | Fuentes (rollup de 43 fuentes) | Una fuente secundaria caída no debe declarar indisponible toda la plataforma. |
| Importante | Notificaciones | Afecta a los usuarios pero no la disponibilidad del mapa. |
| Importante | Proyección de mapa | Idem. |
| Importante | Módulos (ATLAS/VIGÍA/ORÁCULO/TALOS vía gateway canónico) | Afecta capacidades institucionales, no el flujo público principal. |

## SLO provisionales

| Área | SLO (objetivo interno) | SLI | Ventana |
|---|---|---|---|
| Jobs | 99% de corridas programadas iniciadas dentro de la ventana esperada | `scheduled_runs_started / scheduled_runs_expected` | Por pipeline, cron cada 15 min |
| Fuentes críticas (oficiales) | Último éxito dentro de 2 intervalos configurados de la fuente | Edad de `lastSuccessAt` vs. `intervalMinutes × 2` | Continuo (`STALE_SUCCESS_INTERVAL_MULTIPLIER = 3` en `sourceOperationsRegistry.ts` es el umbral real de "degraded"; este SLO es un objetivo más estricto, no el umbral de alarma) |
| Persistencia | &lt;1% de corridas con fallo de persistencia | Persistencias exitosas / intentadas (`KnowledgeIngestionRun.recordsInserted+recordsUpdated` / `recordsFetched`) | Por corrida |
| Proyección | 0 incidentes críticos oficiales descartados por error de mapeo | `projectionDroppedCount` en `/api/vigia/events` y `/api/chile-alerts` para incidentes `severity ∈ {high, critical}` | Por solicitud (no acumulado — ver limitación) |
| Notificación | Todo incidente crítico oficial vigente genera una notificación proyectable | `notification_source_fetch_failed` events en `recentIssuesBuffer` para `getCriticalKnowledgeIncidents` = 0 | Última hora (buffer en memoria) |

## Ventanas de frescura por pipeline

| Pipeline | Ventana | Justificación |
|---|---|---|
| Global Watch | 45 min | Cron cada 15 min (`argus-global-watch.yml`); 45 min = 3 ciclos perdidos antes de considerarlo `degraded`, coherente con `STALE_SUCCESS_INTERVAL_MULTIPLIER` usado por Source Health. |
| Chile Alerts | 45 min | Cron cada 15 min (`argus-cron.yml`), mismo criterio. |
| Fuentes individuales | `intervalMinutes × 3` (ya existente) | Reutiliza `STALE_SUCCESS_INTERVAL_MULTIPLIER` de `src/lib/vigia/sourceOperationsRegistry.ts` — no se inventa una ventana nueva por fuente. |

No se hardcodeó una ventana global única: cada pipeline/fuente usa la suya,
ya definida en el registro existente.

## Limitaciones históricas

- **Sin ventana histórica**: todo lo anterior se evalúa contra el estado
  *actual* (última corrida, buffer en memoria de la última hora). No hay
  manera de calcular "99% de los últimos 30 días" porque no existe
  almacenamiento de métricas persistente (deliberado, ver §46 del prompt).
- **`recentIssuesBuffer` es por proceso**: los SLI basados en él (proyección,
  notificaciones) no son acumulativos entre instancias ni sobreviven un
  redeploy.
- **Ningún SLO de esta tabla está siendo medido/reportado automáticamente
  hoy** más allá de lo que `GET /api/operations/health` puede calcular en
  el momento de la solicitud. Formalizar SLO reales requiere retención
  histórica — explícitamente fuera de alcance de este prompt.
