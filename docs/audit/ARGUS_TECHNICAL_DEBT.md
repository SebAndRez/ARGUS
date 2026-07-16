# ARGUS — Registro de Deuda Técnica

> No se recomienda eliminar nada sin haber demostrado primero ausencia de dependencias. Cada ítem indica evidencia y si su ausencia de uso fue verificada por búsqueda exhaustiva (grep de todas las referencias) o es una estimación (a confirmar).

## 1. Código muerto / huérfano confirmado

| Ítem | Evidencia | Verificación |
|---|---|---|
| `src/lib/ingest/*` (framework completo: `ingestJobTypes.ts`, `ingestJobRegistry.ts`, `retryPolicy.ts`, `deduplicationEngine.ts`, `eventNormalizer.ts`) | Coexiste con `src/lib/ingestion/*` (el que sí está en uso, con rutas API reales) | Grep exhaustivo: cero importadores fuera del propio directorio |
| 9 adaptadores stub (`conafAdapter.ts`, `conasetAdapter.ts`, `csbAdapter.ts`, `desinventarAdapter.ts`, `emdatAdapter.ts`, `iaeaAdapter.ts`, `nhtsaAdapter.ts`, `ntsbAdapter.ts`, `senapredAdapter.ts` de knowledge-intake) | Todos retornan `plannedAdapterResult(...)` | Grep exhaustivo: cero referencias externas |
| 12+ archivos "context" GVP/IOC/NOAA/OpenAQ (`gvpHansCrossReference.ts`, `gvpTsunamiContext.ts`, `openAqVolcanicAshContext.ts`, `noaaCoopsTsunamiObservationContext.ts`, etc.) | Funciones completamente implementadas | Grep exhaustivo: nunca importadas por ninguna ruta/motor/job |
| 4 bridges de NEXUS (`hermesNexusBridge.ts`, `arcaNexusBridge.ts`, `auraNexusBridge.ts`, `fenixNexusBridge.ts`) | Autodocumentados: "NEXUS todavía no existe como módulo completo" | Grep exhaustivo: ninguna función importada desde otro archivo |
| 11 archivos de test con convención propia (`export function runXTest()`) en `src/lib/{source-governance,security,knowledge-intake}/__tests__` y `src/services/__tests__` | p.ej. `runAllPolicy.test.ts`, `rbac.test.ts`, `auditService.test.ts` | Grep exhaustivo: funciones exportadas nunca invocadas por nada |
| `prisma/dev.db` (archivo SQLite residual) | `prisma/schema.prisma` fuerza `provider="postgresql"`, sin ruta sqlite | Obsoleto por diseño de esquema |

## 2. Duplicación de lógica

| Duplicado | Archivos | Riesgo |
|---|---|---|
| Mapeo de severidad de `KnowledgeIncident` | `src/lib/vigia/vigiaIncidentToArgusEvent.ts:36-39` y `src/lib/knowledge-intake/map/knowledgeIncidentToArgusEvent.ts:39-42` (cuerpos idénticos) | Un fix aplicado a uno (canonicalización GDACS verde, v1.0.3.2) no se propagó al otro |
| Clasificadores de severidad/amenaza independientes | `src/lib/vigia/threatClassifier.ts`, `src/lib/vigia/gdacsSeverity.ts`, `src/lib/weather/severeWeatherClassifier.ts`, más lógica dispersa en `firmsClusterer.ts`, `talosScoring.ts`, adaptadores de knowledge-intake | Sin clasificador canónico único — riesgo de deriva confirmado por el propio historial de parches |
| 10+ alias de tipo de severidad (`ArgusSeverity`, `EventSeverity`, `IncidentSeverity`, `ArgusIngestionSeverity`, `ArgusIncidentSeverity`, `RouteHazardSeverity`, `HazardSeverity`, etc.) | `src/types/argusEvent.ts`, `crisis.ts`, `incident.ts`, `ingestion.ts`, `knowledgeIntake.ts`, `routing/routeSafety.ts`, `weatherRisk.ts` | `RouteHazardSeverity`/`HazardSeverity`/`IncidentSeverity` son literalmente el mismo union type declarado 3 veces; `NwsSeverity` y `WeatherSeverity` son duplicados byte-idénticos en dos archivos |
| Resumen de notificaciones (`buildNotificationSummary`) | `src/lib/notifications/notificationCenterEngine.ts:752-764` (servidor) y `NotificationCenterPanel.tsx:49-61` (`summarize()`, cliente) | Dos copias de la misma lógica que pueden divergir |
| Nombre de archivo colisionado, módulos no relacionados | `src/lib/vigia/alertPromotionEngine.ts` vs `src/lib/incidents/alertPromotionEngine.ts`, ambos importados en `globalWatchEngine.ts` | Alto riesgo de edición/importación equivocada por un mantenedor futuro |
| Adaptadores SENAPRED duplicados | `senapredProvider.ts` (Global Watch) vs `senapredEventosAdapter.ts` (mapa en vivo), ambos sobre el mismo cliente GraphQL | Ver `ARGUS_SOURCE_MATRIX.md` — dos crons, dos modelos de destino |
| Sistema FÉNIX duplicado | `/modules/fenix` (demo) vs `/dashboard/fenix` (real) | Ver `ARGUS_MODULE_MATRIX.md` |
| Componentes de tarjeta por módulo sin base compartida | `VigiaReportCard.tsx`, `TalosRiskCard.tsx`, `ArcaShelterCard.tsx`, `HermesRouteCard.tsx` — mismo esqueleto estructural repetido ~9 veces | Sin componente `EntityCard` base; mantenimiento visual disperso |

## 3. Deuda de observabilidad y calidad

- **Cero tests ejecutables en todo el repositorio.** No hay test runner instalado (`jest`/`vitest`/`mocha`), no hay script `"test"` en `package.json`. 19 archivos de estilo jest no compilan (`tsc --noEmit` falla en `src/lib/knowledge-intake/__tests__/*`). 11 archivos de convención propia nunca se invocan. `rbac.test.ts` admite explícitamente la ausencia de harness y prueba una copia manual del array de roles, no el guard real (`apiGuards.ts`) — riesgo de deriva silenciosa.
- **Rate limiting definido pero sin uso.** `src/lib/security/rateLimitPolicy.ts` completo, nunca importado fuera de su archivo.
- **Sistemas críticos sin cobertura de test**: deduplicación, transiciones de lifecycle, autenticación real de endpoints, renderizado de mapa/geometría.
- **24 warnings de lint**, mayoría `react-hooks/set-state-in-effect` concentrados en hooks de navegación/GPS/mapa (`useNavigationSession.ts`, `useLiveMedicalRoute.ts`, `src/app/app/page.tsx`) — no son errores, pero sugieren un patrón sistemático a revisar.
- **`scripts/auditProdSeedData.ts`** (detector de datos seed/demo en producción) existe pero es manual-only, sin hook de CI/cron.

## 4. Riesgos de datos demo/seed (detalle en `ARGUS_MASTER_AUDIT.md` como P0)

- `prisma/seed.ts` ejecuta `deleteMany()` destructivo + inserta reportes ficticios de severidad CRITICAL con nombres de lugares reales de Chile, y **no está protegido por `scripts/guardLocalDatabase.ts`** (ese guard solo antecede a `db:setup:local` y `db:reset:local:danger`, no a `db:seed` directamente, que es el comando que realmente borra/inserta).
- `/api/notifications/route.ts` mezcla `demoEvents`/`demoRoutes` sin pasar por `demoDataGuard`/`isDemoDataAllowed()` — mitigado hoy solo de forma incidental porque `sourceName` contiene la palabra "demo".
- `src/lib/security/demoDataGuard.ts` (archivo nuevo, no comiteado a la fecha de esta auditoría) está bien diseñado y activo en 4 de los ~6 puntos donde debería estar, pero no cubre `/api/notifications` ni `prisma/seed.ts`.

## 5. Deuda arquitectónica de fondo

- Ausencia de entidad canónica de incidente (5+ modelos paralelos) — ítem central del backlog P0, ver `ARGUS_MASTER_BACKLOG.md`.
- Ausencia de `middleware.ts` centralizado — cada ruta repite manualmente su propio guard, lo que ya produjo 3 endpoints P0 sin autenticación.
- `ExternalEvent.expiresAt` como campo muerto (nunca filtrado).
- Falta de bucket de deduplicación específico para incendios forestales.
- Bundle de ~1.15 MB de geometría chilena (`chileRegions.json`) importado estáticamente en la página principal del cliente vía la cadena `demoArgusEvents.ts` → `argusGeometryResolver.ts`, en vez de resolverse server-side o cargarse de forma perezosa.

## 6. Criterio de eliminación futura (no ejecutar en esta fase)

Antes de eliminar cualquier ítem de este registro:
1. Confirmar cero importadores con búsqueda exhaustiva repetida al momento de actuar (el código puede haber cambiado).
2. Confirmar que no es referenciado desde configuración, scripts de build, o documentación activa.
3. Registrar la eliminación en el changelog con referencia a este documento.
4. Priorizar consolidación sobre eliminación cuando exista lógica real detrás de la duplicación (p. ej. los dos mapeadores de severidad deben fusionarse, no simplemente borrarse).
