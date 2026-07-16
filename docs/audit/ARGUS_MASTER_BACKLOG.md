# ARGUS — Backlog Maestro de Gobernanza

> Orden recomendado de ejecución dentro de cada nivel de prioridad es de arriba hacia abajo. Regla general: ordenar → conectar → asegurar → validar → simplificar → observar → recién después expandir.

## P0 — Crítico (bloqueadores de confianza/seguridad, ejecutar primero)

### P0.1 — Autenticar los 3 endpoints mutantes sin protección
- **Problema**: `/api/knowledge-intake/import/manual`, `/api/knowledge-intake/import/file`, `/api/critical-pois/sync` aceptan escrituras reales sin ninguna verificación de identidad.
- **Evidencia**: `ARGUS_ENDPOINT_MATRIX.md` §1.
- **Archivos**: los tres `route.ts` citados.
- **Dependencia**: ninguna — patrón ya existe en 14 archivos hermanos (`knowledge-intake/jobs/*`).
- **Solución propuesta**: añadir `requireOperator()` idéntico al patrón ya usado en las rutas hermanas.
- **Riesgo si no se corrige**: inyección de datos falsos en la base de conocimiento operacional; abuso de recursos de terceros (Overpass API) sin límite.
- **Criterio de aceptación**: las 3 rutas retornan 401/403 sin sesión de operador válida; test manual con curl sin cookie confirma rechazo.
- **Orden**: inmediato, antes de cualquier otro trabajo.

### P0.2 — Guardar `db:seed` contra la base de datos compartida
- **Problema**: `prisma/seed.ts` ejecuta `deleteMany()` destructivo e inserta reportes ficticios de severidad CRITICAL; `scripts/guardLocalDatabase.ts` no antecede a `db:seed`.
- **Evidencia**: `ARGUS_TECHNICAL_DEBT.md` §4.
- **Archivos**: `package.json:23`, `prisma/seed.ts`, `scripts/guardLocalDatabase.ts`.
- **Solución propuesta**: encadenar el guard delante de `db:seed` mismo, y hacer que falle explícitamente si detecta patrones de URL de producción/Supabase compartida.
- **Criterio de aceptación**: `npm run db:seed` contra una `DATABASE_URL` que matchee patrones de producción/Supabase falla antes de ejecutar cualquier query.

### P0.3 — Cerrar la brecha de datos demo en `/api/notifications`
- **Problema**: `demoEvents`/`demoRoutes` se inyectan sin pasar por `demoDataGuard`/`isDemoDataAllowed()`; la mitigación actual depende de que la palabra "demo" aparezca en `sourceName`.
- **Evidencia**: `ARGUS_DATA_FLOW.md` §5, hallazgo del agente de mocks/seeds.
- **Archivos**: `src/app/api/notifications/route.ts:520-530`, `src/lib/security/demoDataGuard.ts`.
- **Solución propuesta**: pasar `isDemo:true` explícito al construir estas notificaciones y gatear su inclusión por `isDemoDataAllowed()`.
- **Criterio de aceptación**: en un entorno donde `getPersistedEvents()` retorna vacío, la respuesta de `/api/notifications` no contiene ítems con severidad P0/P1 provenientes de `demoEvents`/`demoRoutes` salvo que `ARGUS_ALLOW_DEMO_DATA=true`.

### P0.4 — Comitear y verificar `demoDataGuard.ts`
- **Problema**: el guard construido específicamente para el incidente previo (placeholder de Gaza mostrado como alerta oficial P0_CRITICAL) existe solo en el árbol de trabajo local, no desplegado.
- **Evidencia**: `git status` (archivo untracked), hallazgo del agente de mocks/seeds.
- **Solución propuesta**: comitear junto con un test de regresión que confirme que `event-gaza-humanitarian-alert` nunca retorna `severity:"critical"` desde `/api/conflict-events`.
- **Criterio de aceptación**: commit realizado por el propietario del proyecto (no por este proceso de auditoría); test de regresión presente.

### P0.5 — Definir entidad canónica de incidente
- **Problema**: 5+ representaciones paralelas de "un incidente" (`Report/HelpRequest`, `KnowledgeIncident` vía dos mapeadores, `Incident` sintético, `ConflictZone` estático, `RiskAssessment` aislado) sin identidad compartida.
- **Evidencia**: `ARGUS_DATA_FLOW.md`, `ARGUS_SYSTEM_MAP.md` §1, §10.
- **Solución propuesta**: diseñar (no implementar aún) un modelo `Incident` único con adaptadores de entrada por fuente y de salida por consumidor; consolidar `vigiaIncidentToArgusEvent`/`knowledgeIncidentToArgusEvent` en un solo mapeador como primer paso incremental.
- **Criterio de aceptación**: documento de diseño aprobado antes de tocar el esquema Prisma; ningún cambio de esquema en esta fase.

### P0.6 — Relabelar o conectar `/api/incidents` (Command Center)
- **Problema**: la ruta no ejecuta ninguna consulta Prisma; es 100% `buildDemoIncidents()` + store en memoria no persistente.
- **Evidencia**: `ARGUS_DATA_FLOW.md` §4.
- **Solución propuesta**: etiquetar explícitamente como demo en cualquier UI que lo consuma hasta que se conecte a `KnowledgeIncident`, o conectarlo.
- **Criterio de aceptación**: ningún dashboard de producción presenta esta ruta como fuente de datos "operacional" sin una etiqueta visible de demo.

### P0.7 — Resolver duplicación FÉNIX
- **Problema**: el menú de módulos dirige a la versión 100% simulada (`/modules/fenix`); el sistema real con RBAC y 18 fuentes (`/dashboard/fenix`) queda inalcanzable desde el menú.
- **Evidencia**: `ARGUS_MODULE_MATRIX.md`.
- **Solución propuesta**: enlazar `/modules/fenix` al motor real o retirar temporalmente el menú nuevo.
- **Criterio de aceptación**: un usuario institucional que navega desde el menú de módulos llega al motor real, no al mock.

### P0.8 — No exponer roles institucionales sin respaldo de servidor
- **Problema**: `POLICE/AUTHORITY/INSTITUTIONAL_ADMIN/MEDICAL_OPERATOR/LOGISTICS` solo existen vía selector de demo en `localStorage`, sin verificación server-side; CUSTOS/NEXUS/FÉNIX institucional dependen de ellos.
- **Evidencia**: `ARGUS_MODULE_MATRIX.md` §0.
- **Solución propuesta**: bloquear el override de rol de demo en producción, o no renderizar módulos "restringidos" hasta que el modelo de usuario real soporte esos roles.
- **Criterio de aceptación**: en producción, ningún usuario puede alcanzar la vista de CUSTOS/NEXUS institucional sin una sesión de servidor con el rol correspondiente.

## P1 — Alto

1. **Añadir rate limiting real**, priorizando los endpoints P0.1 y las rutas móviles/sensor no autenticadas (`ARGUS_ENDPOINT_MATRIX.md` §6).
2. **Filtrar `ExternalEvent.expiresAt`** en las queries de `/api/external-events` (`ARGUS_DATA_FLOW.md` §6).
3. **Consolidar los dos mapeadores de `KnowledgeIncident`** (`vigiaIncidentToArgusEvent` / `knowledgeIncidentToArgusEvent`) en uno solo (`ARGUS_TECHNICAL_DEBT.md` §2).
4. **Filtrar `resolved` (no solo `archived`)** en `/api/vigia/events` para evitar incidentes resueltos mostrados como activos entre corridas de cron (`ARGUS_DATA_FLOW.md` §2).
5. **Añadir bucket de deduplicación específico para incendios** (FIRMS/EFFIS/Copernicus EMS) (`ARGUS_SOURCE_MATRIX.md` §2).
6. **Resolver duplicación de ingestión SENAPRED** (dos crons, dos adaptadores) — consolidar a uno solo o documentar explícitamente por qué se necesitan ambos (`ARGUS_SOURCE_MATRIX.md` §4).
7. **Serializar la categoría de notificación** (`official`/`argus_analysis`/`candidate`/`prediction`) al cliente y renderizarla como badge visual distintivo (`ARGUS_DATA_FLOW.md` §5).
8. **Excluir `RESOLVED`/`DISMISSED` del conteo de "críticas"** en la campana de notificaciones (`ARGUS_MASTER_AUDIT.md`).
9. **Instalar un test runner real** (vitest recomendado dado el stack TS) y convertir o eliminar los 11 archivos de test de convención propia que nunca se ejecutan (`ARGUS_TECHNICAL_DEBT.md` §3).
10. **Wirear el adaptador SENAPRED en vivo a la resolución de geometría real** para todas las severidades, no solo las promovidas a alta/crítica (corrige el remanente del bug de rectángulo para alertas regionales tempranas) (`ARGUS_SYSTEM_MAP.md` §11).
11. **Ningún módulo vertical usa `ArgusEvent`** — decidir y documentar si los módulos deben unificarse sobre `ArgusEvent` o mantenerse como universos de datos distintos, mencionándolo explícitamente en la UI si es lo segundo (`ARGUS_MODULE_MATRIX.md` §3).
12. **Ampliar el scheduler a los ~20 adaptadores implementados pero inertes**, o corregir cualquier panel de salud de fuentes que los reporte como operativos (`ARGUS_SOURCE_MATRIX.md`).

## P2 — Medio

1. Consolidar los 10+ alias de tipo de severidad en un tipo canónico único (`ARGUS_TECHNICAL_DEBT.md` §2).
2. Eliminar o documentar `src/lib/ingest/*` (framework huérfano) tras confirmar ausencia total de dependencias.
3. Persistir auditoría real de CUSTOS (actualmente solo `console.info` fuera de producción) o bloquear el módulo en producción hasta hacerlo.
4. Programar `scripts/auditProdSeedData.ts` como job periódico (ej. GitHub Action semanal) con alerta en caso de hallazgo.
5. Mover la resolución de geometría (`chileRegions.json`, ~1.15 MB) fuera del bundle de cliente de la página principal.
6. Renombrar uno de los dos archivos `alertPromotionEngine.ts` para eliminar la colisión de nombres.
7. Definir un componente `EntityCard` base compartido para reducir la duplicación de tarjetas de módulo.
8. Añadir vigencia/expiración visible en los componentes de tarjeta/popup que actualmente la omiten.
9. Documentar formalmente la asimetría de nombre `CRON_SECRET`/`ARGUS_CRON_SECRET` en un runbook, no solo en comentarios.

## P3 — Bajo

1. Eliminar o implementar los 9 adaptadores stub sin ninguna referencia externa.
2. Eliminar el archivo `prisma/dev.db` residual.
3. Revisar los 24 warnings de lint `react-hooks/set-state-in-effect` concentrados en hooks de navegación/GPS.
4. Renombrar `GLOBAL_WATCH_PRIORITY_CAP` para no confundirse con el campo `scope=GLOBAL` de notificaciones.
5. Incorporar timestamp de recencia real al efecto de "pulso" de los marcadores del mapa (hoy refleja estado/severidad, no antigüedad).
6. Añadir un campo de "importancia" independiente de severidad para el tamaño de marcador en el mapa/Orbit 3D.

## Próxima etapa recomendada (única, no en paralelo)

Ver recomendación consolidada en `ARGUS_MASTER_AUDIT.md` §10 — **estabilizar y unificar la entidad de incidente y cerrar los 3 endpoints P0 antes de cualquier expansión de fuentes o módulos nuevos.**
