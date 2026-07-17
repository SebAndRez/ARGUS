# ARGUS — Consolidación de fuentes, adaptadores y capas de datos (Prompt 4)

**Fecha**: 2026-07-17
**Tipo**: auditoría + consolidación dirigida — no rediseño.
**Alcance**: no se modificó `prisma/schema.prisma` (ya estaba modificado por trabajo previo del usuario, sin relación con esta tarea — ver §0), no se crearon migraciones, no se activó ninguna fuente nueva, no se tocó el mapa ni módulos, no se hizo commit ni push.

---

## 0. Hallazgo de partida — mucho de lo pedido ya existía

Antes de escribir código se releyeron los documentos de arquitectura vigentes y se auditó el código real. Hallazgo central: **la mayor parte del objetivo principal del Prompt 4 ("un registro operacional de fuentes") ya estaba implementada** por una sesión previa no reflejada en la numeración de este hilo (`Prompt 16` en su propia numeración interna, fechada 2026-07-14):

- `src/lib/vigia/sourceOperationsRegistry.ts` — `ARGUS_SOURCE_OPERATIONS_REGISTRY`, 43 fuentes, ya es la fuente de verdad para "¿esta fuente alimenta ARGUS hoy?", con `deriveSourceOperationalStatus()` calculado dinámicamente (nunca constante) contra `KnowledgeIngestionRun` real.
- `src/lib/vigia/sourceScheduler.ts` — vencimiento por fuente, backoff exponencial con tope, lock por fuente (`argus:source-lock:<id>`) reutilizando `jobLockBackend.ts`.
- `src/app/api/vigia/source-health/{public,full}` — Source Health dinámico real, con vista pública (`{id,category,role,level}`) y vista de operador (`requireOperator()`, sin secretos), ambas DB-backed vía `getRecentIngestionRunsBySource`.
- SENAPRED — single owner confirmado por `ARGUS_SENAPRED_CANONICAL_INGESTION.md` (sesión previa a este hilo) y verificado de nuevo en esta tarea contra los workflows reales (§6).
- Documentación previa (`docs/operations/ARGUS_SOURCE_OPERATIONS_BASELINE.md`, `ARGUS_SOURCE_ACTIVATION_BACKLOG.md`, ambas 2026-07-14) ya justifica explícitamente por qué **~8 registros distintos sobreviven** sin fusionarse, con propósito y consumidores documentados para cada uno.

**Esta tarea no repite ese trabajo.** Verifica que sigue vigente contra el código actual (§1-§8), y cierra las brechas concretas que quedaban abiertas: el registro de gobernanza nunca consultaba disponibilidad operacional real (Fase I del mandato), no existía un contrato formal de adaptador (§9 del mandato), y persistía una duplicación real de USGS entre el pipeline canónico y un pipeline legado (`ExternalEvent`).

**Nota de protección de trabajo ajeno**: `git status` al iniciar mostró un conjunto grande de cambios sin commit, no relacionados con este prompt — una función de "conectividad de telecomunicaciones/roaming de emergencia" (`prisma/schema.prisma` +104/-15 líneas, `TelecomConnectivityStatus`/`TelecomConnectivityEvidence`, `src/lib/connectivity/`, `src/app/api/telecom-connectivity/`, `src/components/modules/TelecomConnectivity*`, cambios en `notificationCenterEngine.ts`, `rbac.ts`, `fenixSimulationEngine.ts`, etc.). **Ninguno de esos archivos fue tocado en esta tarea.** `npm run build` falla hoy por un error de tipos preexistente dentro de esa función (`notificationCenterEngine.ts:893`, `VerificationStatus`), confirmado por `git stash`/`git stash pop` como no relacionado con ningún archivo de esta tarea — documentado en §14, no corregido (fuera de alcance, riesgo de interferir con trabajo en curso del usuario).

---

## 1. Inventario verificado (no solo releído — grep + lectura de código real)

| Fuente | Registro | Adaptador real | Ejecutor | Destino | Cadencia | Estado real verificado |
|---|---|---|---|---|---|---|
| USGS (sismos) | `ARGUS_SOURCE_OPERATIONS_REGISTRY` | `usgsAdapter.ts` (Global Watch) **+ `ingestUsgsEarthquakes.ts`** (legado, activo) | `globalWatchEngine.ts` (5 min) **+ `/api/notifications` en vivo (60s caché)** | `KnowledgeIncident` **+ `ExternalEvent`** | 5 min / bajo demanda | **DUPLICADA — confirmada, ver §3** |
| GDACS | ídem | `gdacsAdapter.ts` — único | `globalWatchEngine.ts` | `KnowledgeIncident` | 15 min | Operativa, sin duplicación (el hallazgo de duplicación de la auditoría original ya no es real) |
| NASA FIRMS | ídem | `firmsAdapter.ts` — único | `globalWatchEngine.ts` | `KnowledgeIncident` | 15 min | Operativa, sin duplicación |
| SENAPRED | ídem | `senapredProvider.ts` + `chileAlertPromotionEngine.ts` — único owner, lock compartido | Chile Alerts job / Global Watch (delegado) | `KnowledgeIncident` | 15 min | Single owner confirmado en código, no solo en doc (§6) |
| Resto (18 Grupo B, 14 Grupo C) | ídem | Ver `ARGUS_SOURCE_ACTIVATION_BACKLOG.md` | Manual/disabled | Variable | — | Sin cambios — brecha ya documentada por fuente, no repetida aquí |

---

## 2. Registro operacional final — fuente de verdad seleccionada

**`ARGUS_SOURCE_OPERATIONS_REGISTRY`** (`src/lib/vigia/sourceOperationsRegistry.ts`) se ratifica como la única fuente de verdad para capacidad + estado operacional real. No se creó un registro nuevo. Los ~7 registros restantes se mantienen sin fusionar, cada uno con propósito distinto ya documentado en `ARGUS_SOURCE_OPERATIONS_BASELINE.md` §2 (gobernanza de permisos, catálogo de licencias de knowledge-intake, tier del pipeline legado `/api/argus/events`, packs de país). Confirmado vigente contra el código actual — sin contradicciones nuevas encontradas.

**Brecha cerrada en esta tarea**: `src/lib/source-governance/sourceGovernanceRegistry.ts` (permisos/gobernanza, ~30 fuentes, IDs con guion) nunca consultaba si una fuente **realmente** tiene adaptador implementado/configurado/habilitado. Nuevo módulo puente de solo lectura, `src/lib/source-governance/sourceOperationalBridge.ts`, resuelve el id de gobernanza (`usgs-earthquake`) contra su contraparte en el registro operacional (`usgs_earthquake`) y responde `checkOperationalAvailability()` — fail-open cuando no hay contraparte conocida (nunca concede un permiso que gobernanza no otorgó, solo puede negar uno que gobernanza sí otorgó pero que operacionalmente es falso). Conectado en `sourceIntelligenceRouter.ts::planSource()` — la única ruta de gobernanza con cero consumidores en el pipeline de ingesta real, por lo que conectarlo no toca el cron de producción.

---

## 3. Contrato de adaptador (`src/lib/canonical/sourceAdapterContract.ts`)

```ts
interface ArgusSourceAdapter<RawPayload = unknown> {
  sourceId: string;
  fetch(context: SourceFetchContext): Promise<SourceFetchResult<RawPayload>>;
  normalize(payload: RawPayload, context: SourceNormalizeContext): ArgusIncidentKnowledge[];
  validate(observation: ArgusIncidentKnowledge): ValidationResult;
}
```

- Reutiliza `ArgusIncidentKnowledge` (`@/types/knowledgeIntake`) como shape normalizado — el mismo que ya alimenta `KnowledgeIncident` y que el mapeador canónico del Prompt 3 ya proyecta. No se inventó un segundo shape.
- Reutiliza `SourceErrorCode` (10 códigos, `sourceOperationsRegistry.ts`) y `classifySourceError()` (`sourceScheduler.ts`) — sin duplicar clasificación de errores.
- **Implementación de referencia**: `src/lib/canonical/adapters/usgsSourceAdapter.ts`, compone `fetchRawUsgsFeed()` (nuevo export puramente aditivo de `usgsAdapter.ts`, sin cambiar `fetchUsgsEarthquakes()` existente) + `normalizeUsgsEarthquakeFeature()` (ya existente) + `validateNormalizedObservation()` (nuevo, genérico). No reemplaza el camino real de `globalWatchEngine.ts` — es una segunda forma de invocar la misma lógica bajo el contrato formal, para cualquier orquestador futuro.
- No se forzó esta interfaz sobre los ~24 adaptadores de `knowledge-intake/adapters/` existentes — el mandato explícitamente no lo exige ("no estás obligado a utilizar estos nombres") y hacerlo sería una migración masiva de alto riesgo fuera de proporción para esta tarea.

---

## 4. USGS y GDACS — verificación de duplicación

### USGS — duplicación real confirmada (P0)

Dos implementaciones activas y realmente invocadas hoy:

| | Camino canónico (Prompt 3) | Camino legado |
|---|---|---|
| Archivo | `src/lib/knowledge-intake/adapters/usgsAdapter.ts` | `src/lib/ingestion/ingestUsgsEarthquakes.ts` |
| Invocado por | `globalWatchEngine.ts` (cron, cada 5 min) | `/api/notifications` (cada request, caché 60s) y `/api/ingest/usgs-earthquakes` (client-side desde `src/app/app/page.tsx`) |
| Persiste en | `KnowledgeIncident` + `KnowledgeEvidence` | `ExternalEvent` |
| Pasa por el mapeador canónico | Sí (`canonicalKnowledgeIncidentToArgusEvent`) | No |

Esto es exactamente lo prohibido por el mandato §2 ("fuentes que escriban simultáneamente en modelos legados y canónicos") y §11 ("no se debe consultar USGS dos veces por ciclo desde procesos distintos"). **No se consolidó en esta tarea** — ver §14 para la razón técnica exacta y la condición de cierre. GDACS y FIRMS, en cambio, **no** tienen esta duplicación: un solo fetch real cada uno, ambos alimentan solo `KnowledgeIncident` vía Global Watch — el hallazgo de duplicación de la auditoría original para esas dos fuentes ya no refleja el código actual.

---

## 5. SENAPRED — verificación de propiedad única

Confirmado en código (no solo en documentación): `globalWatchEngine.ts::runSenapredSource()` y `POST /api/chile-alerts/run` toman el mismo lock `"senapred-ingestion"` antes de tocar `KnowledgeIncident`; si uno lo sostiene, el otro se marca `skipped` en vez de re-consultar. Los dos workflows de GitHub Actions (`argus-cron.yml` :07/:22/:37/:52, `argus-global-watch.yml` :03/:18/:33/:48) están además desfasados en offset, pero la garantía real de no-duplicación es el lock compartido, no el offset. Sin cambios necesarios.

---

## 6. Fuentes de incendios (FIRMS/EFFIS/Copernicus EMS/EONET)

Sin duplicación de fetch encontrada. Roles ya diferenciados correctamente en el registro operacional (`role: detection` para FIRMS/EONET, `role: confirmation` para EFFIS/Copernicus EMS) — coincide con el rol conceptual que pide el mandato (FIRMS = señal satelital, EFFIS/EMS = confirmación/cartografía oficial, EONET = agregador). Sin cambios necesarios.

---

## 7. Archivos modificados

| Archivo | Cambio | Motivo |
|---|---|---|
| [usgsAdapter.ts](src/lib/knowledge-intake/adapters/usgsAdapter.ts) | Nuevo export aditivo `fetchRawUsgsFeed()` (fetch puro, sin normalizar) | Permite separar fetch/normalize bajo el contrato único sin tocar `fetchUsgsEarthquakes()` existente |
| [sourceIntelligenceRouter.ts](src/lib/source-router/sourceIntelligenceRouter.ts) | `planSource()` consulta `checkOperationalAvailability()` antes de decidir `action` | Fase I: aplicar gobernanza contra capacidad real, no solo flags declarados a mano |

## 8. Archivos nuevos

[sourceAdapterContract.ts](src/lib/canonical/sourceAdapterContract.ts) · [usgsSourceAdapter.ts](src/lib/canonical/adapters/usgsSourceAdapter.ts) · [sourceOperationalBridge.ts](src/lib/source-governance/sourceOperationalBridge.ts) · pruebas: [sourceAdapterContract.test.ts](tests/canonical/sourceAdapterContract.test.ts) (8 casos) · [usgsSourceAdapter.test.ts](tests/canonical/usgsSourceAdapter.test.ts) (7 casos) · [sourceOperationalBridge.test.ts](tests/canonical/sourceOperationalBridge.test.ts) (7 casos) · este documento.

---

## 9. Pruebas ejecutadas

| Comando | Resultado | Observaciones |
|---|---|---|
| `npm run test` | 1080/1080 pasan, 99/101 archivos | 2 archivos fallan por el mismo bug preexistente de hoisting de `vi.mock` en `tests/p0/codigo-azul-*` (ya presente antes de esta tarea, confirmado vía `git stash`), no relacionado |
| `npx tsc --noEmit` | 0 errores nuevos | 3 errores preexistentes sin relación (`CriticalPoiMarker.tsx`, `notificationCenterEngine.ts` — feature de telecom en curso del usuario; `senapredSingleOwner.test.ts` — ya preexistente) |
| `npm run lint` | 0 errores, 24 warnings preexistentes (hooks React) | Ninguno en archivos de esta tarea |
| `npm run build` | **Falla** — error de tipos en `notificationCenterEngine.ts:893` | Confirmado preexistente (persiste con `git stash` aplicado a mis cambios), pertenece a la función de telecom-connectivity sin commit del usuario, no corregido (fuera de alcance) |
| `npx prisma validate` | Válido | `schema.prisma` no fue tocado por esta tarea (ya estaba modificado por trabajo previo del usuario) |

---

## 10. Deuda pendiente por fuente

| Fuente | Deuda | Prioridad | Dependencia | Criterio de cierre |
|---|---|---|---|---|
| USGS | Doble fetch/persistencia (`ExternalEvent` vía `/api/notifications` + `src/app/app/page.tsx`, en paralelo a `KnowledgeIncident` vía Global Watch) | **P0** | Migrar `/api/notifications` a leer sismos desde `KnowledgeIncident`/capa canónica (Prompt 3, `canonicalReadLayer`/`/api/vigia/events`) en vez de invocar `getOrFetchUsgsEarthquakes()` en cada request; migrar o retirar `src/app/app/page.tsx` (página legada, fuera del sistema de módulos) | Cero llamadas a `ingestUsgsEarthquakes.ts` fuera de un job de retiro explícito, verificado por grep + logs de acceso durante ≥2 semanas |
| Gobernanza↔operaciones | Solo `sourceIntelligenceRouter.ts` consulta el puente nuevo; `globalWatchEngine.ts` (el cron real) sigue sin consultar `sourceGovernanceRegistry` en absoluto | P1 | Diseño explícito de qué debe pasar si gobernanza y capacidad operacional discrepan para una fuente ya programada — riesgo de cambiar comportamiento de 8 fuentes en producción sin ventana de prueba | Decisión de producto + prueba de regresión en `sourceScheduling.integration.test.ts` antes de conectar |
| Fenix/telecom-connectivity | `npm run build` roto por error de tipos ajeno a este prompt | P1 (del propietario de esa función, no de esta tarea) | Trabajo del usuario en curso, sin commit | El propio usuario corrige `VerificationStatus` en `notificationCenterEngine.ts:893` |
| 18 fuentes Grupo B / 14 Grupo C | Sin cambios — ver `ARGUS_SOURCE_ACTIVATION_BACKLOG.md`, vigente | P2-P3 | Normalizador + persistencia + dedup + tests por fuente | Ya documentado por fuente en el backlog existente |

---

## 11. Próximo bloque recomendado

Para **Prompt 5 — Integración cartográfica, rendimiento y simbología compartida**: el mapeador canónico (Prompt 3) y el registro operacional (esta tarea + Prompt 16 previo) ya garantizan que `ArgusEvent` es la única proyección que el mapa debería consumir — ningún cambio de esta tarea afecta esa garantía. El hallazgo pendiente más relevante para Prompt 5 es que `src/app/app/page.tsx` (página legada) sigue leyendo `/api/ingest/usgs-earthquakes` directamente en el cliente en vez de la capa canónica — si Prompt 5 toca el mapa, debería heredar esa migración en vez de perpetuar el camino legado.
