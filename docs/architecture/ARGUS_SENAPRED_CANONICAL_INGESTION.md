# ARGUS — Ingestión canónica SENAPRED (Single Owner)

**Fecha**: 2026-07-16
**Hallazgo resuelto**: `ING-FINAL-001` — SENAPRED tenía más de un propietario de ingestión.
**Alcance**: verificación + consolidación de referencias + tests de regresión. No se modificó `prisma/schema.prisma`, no se crearon migraciones, no se cambió el formato de `ArgusEvent`/`KnowledgeIncident`, no se creó una segunda ruta ni un segundo scheduler.
**Nota**: este documento ya estaba referenciado (`src/lib/vigia/sourceOperationsRegistry.ts`, entrada `senapred_eventos`) pero nunca había sido escrito — este archivo cierra ese hueco.

---

## 1. Owner oficial

Un único pipeline de dos etapas es el propietario canónico de todo lo relacionado con SENAPRED:

| Etapa | Archivo | Función | Responsabilidad |
|---|---|---|---|
| Fetch | [`src/lib/sources/chile/senapredProvider.ts`](../../src/lib/sources/chile/senapredProvider.ts) | `fetchChileOfficialAlertsRaw()` | Única consulta real contra AppSync (`senapredGraphqlClient.ts` + `senapredAwsAuth.ts`, firma SigV4 anónima). Pagina, deduplica, enriquece con detalle comuna/provincia solo cuando el texto lo amerita. |
| Normalizar + persistir + lifecycle | [`src/lib/incidents/chileAlertPromotionEngine.ts`](../../src/lib/incidents/chileAlertPromotionEngine.ts) | `promoteChileOfficialAlerts()` | Clasifica amenaza/severidad (`severeWeatherClassifier`), resuelve geometría administrativa real (`argusGeometryResolver`), genera el ID canónico (`buildExternalId`, determinista por amenaza+área+día — nunca depende del scheduler u orden de llegada), decide lifecycle (`chileAlertLifecycle`), y persiste vía `upsertKnowledgeIncidentByExternalId`/`saveKnowledgeEvidenceIfNew` (servicio de persistencia ya deduplicado, sin lógica nueva). |

Estas dos funciones — y solo estas dos — son capaces de consultar, interpretar, normalizar, generar IDs, persistir y actualizar lifecycle para `sourceId: "senapred_eventos"`.

## 2. Flujo único

```
Scheduler (2 disparadores posibles, mismo pipeline)
      │
      ├─ manual/cron: POST /api/chile-alerts/run  ─┐
      │  GET  /api/jobs/run-chile-alerts (cron)    ├─► runChileAlertsIngestion()
      │                                             │
      └─ Global Watch: runGlobalWatch()            │
         (source id = "senapred_eventos")           ├─► fetchChileOfficialAlertsRaw()
                                                      │        │
                                                      │        ▼
                                                      └─► promoteChileOfficialAlerts()
                                                               │
                                                               ▼
                                                   upsertKnowledgeIncidentByExternalId()
                                                   (KnowledgeIncident, sourceId="senapred_eventos")
                                                               │
                                                               ▼
                                          canonicalKnowledgeIncidentToArgusEvent() (mapeador único, Prompt 9)
                                                               │
                                          ┌────────────────────┼────────────────────┐
                                          ▼                    ▼                    ▼
                              GET /api/chile-alerts   GET /api/argus/events   Source Health
                                (lectura pura)          (lectura pura)      (lee IngestionRun,
                                                                             nunca re-consulta SENAPRED)
```

Ambos disparadores del scheduler (el pipeline dedicado "Chile Alerts" y el paso `senapred_eventos` dentro de Global Watch) llaman a la **misma referencia de función** `promoteChileOfficialAlerts` — verificado empíricamente en `tests/senapred/senapredSingleOwner.test.ts`, no solo por comentario. Nunca corren en paralelo sobre la misma fuente: ambos toman el lock compartido `senapred-ingestion` (`src/lib/jobs/jobLock.ts`) antes de tocar `KnowledgeIncident`; si uno lo tiene, el otro se marca `skipped_senapred_lock`/`skipped` en vez de fallar la corrida completa.

## 3. Componentes y su clasificación

| Archivo | Función | Rol | Clasificación |
|---|---|---|---|
| `src/lib/sources/chile/senapredProvider.ts` | `fetchChileOfficialAlertsRaw` | Fetch único | **Owner (fetch)** |
| `src/lib/incidents/chileAlertPromotionEngine.ts` | `promoteChileOfficialAlerts` | Normalizador + persistencia + lifecycle | **Owner (normalizador/persistencia)** |
| `src/lib/adapters/senapred/senapredGraphqlClient.ts` | `fetchAlertasByDatePage`, `fetchAlertaDetail`, `fetchSenapredReferenceTables` | Cliente GraphQL de bajo nivel | Helper interno — único consumidor: `senapredProvider.ts` |
| `src/lib/adapters/senapred/senapredAwsAuth.ts` | `getAnonymousAwsCredentials`, `signAppSyncRequest` | Firma SigV4 anónima | Helper interno — único consumidor: `senapredGraphqlClient.ts` |
| `src/app/api/chile-alerts/run/route.ts` | `runChileAlertsIngestion`, `POST` | Disparador manual/operador + función compartida con el cron | Scheduler (entrada 1) — delega en el owner |
| `src/app/api/jobs/run-chile-alerts/route.ts` | `GET`/`POST` | Alias de cron (GitHub Actions, `CRON_SECRET`) | Scheduler (entrada 1, alias) — llama literalmente `runChileAlertsIngestion` importada de la ruta anterior |
| `src/lib/vigia/globalWatchEngine.ts` | `runSenapredSource` (dentro de `runGlobalWatch`) | Paso SENAPRED del scheduler multi-fuente Global Watch | Scheduler (entrada 2) — delega en el mismo owner, bajo el mismo lock compartido |
| `src/lib/adapters/senapred/senapredEventosAdapter.ts` | `fetchSenapredAlerts` | Proyección de lectura *sin persistencia*, delega en `fetchChileOfficialAlertsRaw` | **Wrapper de diagnóstico** — único consumidor: `/api/argus/senapred/live` |
| `src/app/api/argus/senapred/live/route.ts` | `GET` | Endpoint manual de diagnóstico (debug) | Wrapper de solo lectura — protegido por el mismo lock `senapred-ingestion`, nunca persiste, nunca escribe lifecycle, nunca alimenta Source Health |
| `src/app/api/chile-alerts/route.ts` | `GET` | Lectura pública de `KnowledgeIncident` (`sourceId: senapred_eventos`) | Consumidor de lectura — usa el mapeador canónico único |
| `src/app/api/argus/events/route.ts` | `GET` | Lectura pública de `KnowledgeIncident` para el mapa 2D/Orbit (`source: "senapred_persisted"` vs `"curated_demo"`, gateado por `isDemoDataAllowed()`) | Consumidor de lectura — usa el mapeador canónico único |
| `src/app/api/sources/status/route.ts` | `GET` | Source Health | Consumidor de lectura — lee `IngestionRun`/`ExternalEvent` persistidos, **nunca** llama `fetchChileOfficialAlertsRaw`/`promoteChileOfficialAlerts` (verificado en test) |
| `src/lib/modules/canonicalIncidentGateway.ts` | entrada de catálogo `senapred_chile_knowledge_intake_stub` | Registro de un adaptador *planeado pero nunca implementado* (`endpoint: "Sin implementar"`) | **Legacy/nunca activo** — ya autodocumentado como `consumer: "Ninguno — superado por senapred_eventos"`. No es una implementación ejecutable; se deja como nota histórica del catálogo, cero riesgo. |

## 4. Por qué el endpoint de diagnóstico no es un segundo owner

`GET /api/argus/senapred/live` (`src/app/api/argus/senapred/live/route.ts`) consulta la fuente en vivo bajo demanda (uso manual/operativo, no automatizado). Se considera **wrapper de diagnóstico**, no un segundo owner, porque:

1. Delega en `fetchSenapredAlerts()` → `fetchChileOfficialAlertsRaw()` — el mismo fetch único, nunca una paginación propia.
2. Está protegido por el mismo lock `senapred-ingestion` que usan ambos schedulers — no puede ejecutarse en paralelo con una ingestión real.
3. **Nunca persiste**: no llama `upsertKnowledgeIncidentByExternalId`, no llama `promoteChileOfficialAlerts`, no escribe `KnowledgeIncident`/`KnowledgeEvidence`.
4. No alimenta Source Health ni el mapa operativo (`/api/argus/events` lee la persistencia canónica directamente, no este endpoint).

## 5. Verificación

- `tests/senapred/senapredConsolidation.test.ts` (preexistente, Prompt 14): identidad estable del ID canónico, lifecycle por texto, geometría real, manejo de vacío/timeout/error de parsing, mismo mapeador para `/api/chile-alerts` y `/api/argus/events`.
- `tests/senapred/senapredSingleOwner.test.ts` (nuevo, ING-FINAL-001): prueba explícitamente que los 3 disparadores (manual, cron, Global Watch) invocan la **misma referencia** de `promoteChileOfficialAlerts`/`fetchChileOfficialAlertsRaw` — no tres implementaciones que coinciden por casualidad — y que Source Health nunca las invoca.
- `tests/jobs/jobLockEndpoints.test.ts` (preexistente, Prompt 13): Chile Alerts se salta la promoción cuando Global Watch ya sostiene el lock `senapred-ingestion`, y viceversa — nunca escriben en paralelo.
