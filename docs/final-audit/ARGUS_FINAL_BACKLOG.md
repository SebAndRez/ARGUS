# ARGUS — backlog definitivo vigente

Solo contiene tareas abiertas del árbol auditado el 2026-07-15. Dependencias usan IDs de este documento.

## Fase 0 — bloqueadores P0

### PRIV-FINAL-001 — Redactar y autorizar HelpRequest/Report

- **Prioridad/área:** P0 — Privacidad/API
- **Problema:** lecturas anónimas devuelven filas completas con descripción y coordenadas precisas.
- **Evidencia:** `src/app/api/help-requests/route.ts:9-14,27-47`; `src/app/api/reports/route.ts:9-14,31-49`.
- **Impacto:** exposición de personas vulnerables y ubicaciones de auxilio.
- **Dependencias:** ninguna.
- **Alcance:** contratos GET públicos, vistas operador, mapa, serializers y tests.
- **Criterio de aceptación:** anónimo nunca recibe texto privado ni coordenada exacta; operador autorizado conserva acceso justificado; `restrictedMode` siempre se respeta.
- **Pruebas requeridas:** matriz anónimo/ciudadano/operador/admin, snapshots de redacción, regresión de mapa.
- **Riesgo de regresión:** alto; puede ocultar incidentes legítimos o romper mapa.

### DATA-FINAL-001 — Eliminar mezcla demo del mapa y Orbit

- **Prioridad/área:** P0 — Confianza de datos/frontend
- **Problema:** `demoArgusEvents` es estado inicial y fallback no guardado y se concatena con eventos reales.
- **Evidencia:** `src/app/app/page.tsx:21,392,1879-1896`; `GlobeView.tsx` consume la misma colección.
- **Impacto:** alerta falsa crítica y doble conteo.
- **Dependencias:** ninguna.
- **Alcance:** mapa 2D, Orbit, estados empty/error, labels y contadores.
- **Criterio de aceptación:** producción inicia vacío/loading; fallo real muestra unavailable; demo solo con flag, label y colección separada.
- **Pruebas requeridas:** producción+fetch fallido, demo flag off/on, mezcla con Chile/VIGÍA, conteos 2D/3D.
- **Riesgo de regresión:** alto; riesgo de mapa vacío si el manejo de error no queda explícito.

## Fase 1 — piloto seguro

### REL-FINAL-001 — Restaurar build de producción

- **Prioridad/área:** P1 — Release/frontend
- **Problema:** `/dashboard` renderiza `AtlasDashboard` sin `Suspense`.
- **Evidencia:** build fallido; `AtlasDashboard.tsx:114`, `dashboard/page.tsx:9`.
- **Impacto:** no existe artefacto desplegable.
- **Dependencias:** ninguna.
- **Alcance:** rutas Atlas/dashboard y CI.
- **Criterio de aceptación:** `npm run build` termina 0 y ambas rutas pasan smoke.
- **Pruebas requeridas:** build limpio y navegación SSR/CSR.
- **Riesgo de regresión:** medio.

### ING-FINAL-001 — Designar propietario único de SENAPRED

- **Prioridad/área:** P1 — Ingestión
- **Problema:** dos workflows consultan SENAPRED en la misma cadencia.
- **Evidencia:** ambos cron; `globalWatchEngine.ts:299-318,388`.
- **Impacto:** fetch/upsert duplicado y salud/notificaciones inconsistentes.
- **Dependencias:** JOB-FINAL-001.
- **Alcance:** Global Watch, Chile Alerts, registry, workflow y Source Health.
- **Criterio de aceptación:** una sola llamada lógica por ventana; el consumidor secundario lee persistencia/resultado.
- **Pruebas requeridas:** integración de ambos triggers, concurrencia y corrida secuencial.
- **Riesgo de regresión:** alto; puede omitir alertas si se apaga el dueño equivocado.

### OPS-FINAL-001 — Corregir códigos HTTP de jobs

- **Prioridad/área:** P1 — Operaciones
- **Problema:** `status:failed` retorna 200 y Actions lo marca exitoso.
- **Evidencia:** job routes devuelven `NextResponse.json(summary/result)` sin status.
- **Impacto:** fallo total silencioso.
- **Dependencias:** ninguna.
- **Alcance:** handlers, workflows, observabilidad y runbook.
- **Criterio de aceptación:** failed→5xx; partial→contrato explícito; workflow falla ante fallo total.
- **Pruebas requeridas:** todas fuentes fallan, una falla, éxito, lock, timeout.
- **Riesgo de regresión:** medio; alertas de CI pueden aumentar correctamente.

### JOB-FINAL-001 — Implementar idempotencia duradera

- **Prioridad/área:** P1 — Jobs/datos
- **Problema:** runId es token de lock; tras release la misma clave reejecuta.
- **Evidencia:** `runIdentity.ts`, `jobLock.ts`; ausencia de store de resultados.
- **Impacto:** efectos repetidos por retries/replay.
- **Dependencias:** backend distribuido verificado.
- **Alcance:** Global Watch, Chile Alerts y VIGÍA manual.
- **Criterio de aceptación:** misma key devuelve resultado previo durante TTL sin invocar motor.
- **Pruebas requeridas:** retry concurrente, secuencial, tras fallo, tras TTL y multi-instancia mock.
- **Riesgo de regresión:** alto; una clave mal retenida puede bloquear corridas válidas.

### SEC-FINAL-002 — Proteger diagnóstico live de SENAPRED

- **Prioridad/área:** P1 — Seguridad operacional
- **Problema:** GET público consulta upstream y devuelve diagnóstico sin rate limit.
- **Evidencia:** `src/app/api/argus/senapred/live/route.ts:31-65`.
- **Impacto:** abuso y amplificación de proveedor.
- **Dependencias:** SEC-FINAL-003.
- **Alcance:** auth, parámetros, respuesta y rate limit.
- **Criterio de aceptación:** solo operador; anónimo no adquiere lock ni llama proveedor.
- **Pruebas requeridas:** roles, payload/query bounds, 429/503, upstream no invocado.
- **Riesgo de regresión:** bajo.

### SEC-FINAL-003 — Completar política de rate limiting

- **Prioridad/área:** P1 — Seguridad/disponibilidad
- **Problema:** solo 17/168 rutas usan el helper; backend productivo no verificado.
- **Evidencia:** inventario de imports/calls; ingestores y compute públicos sin límite.
- **Impacto:** saturación, costos y abuso.
- **Dependencias:** configuración Upstash y monitoreo.
- **Alcance:** rutas públicas costosas, mutantes, jobs manuales, payload y bbox.
- **Criterio de aceptación:** 188 métodos clasificados; todos los críticos aplican policy antes del efecto; producción falla cerrado donde corresponda.
- **Pruebas requeridas:** 429/headers, backend caído, privacidad de keys y no ejecución.
- **Riesgo de regresión:** alto; un fail-closed mal aplicado puede bloquear cron.

### DATA-FINAL-002 — Unificar vista e identidad de incidentes

- **Prioridad/área:** P1 — Datos/arquitectura
- **Problema:** modelos, IDs y fetches paralelos impiden una vista consistente.
- **Evidencia:** Prisma y fetches `app/page.tsx:1647-2213`; gateway canónico aditivo.
- **Impacto:** omisión, duplicado y lifecycle divergente.
- **Dependencias:** DATA-FINAL-001, ING-FINAL-001.
- **Alcance:** mapa, Orbit, módulos, notificaciones y Command Center.
- **Criterio de aceptación:** un ID estable y proyección común; diferencias documentadas solo por compatibilidad temporal.
- **Pruebas requeridas:** contrato cruzado de los tres endpoints, mapa/Orbit/módulos y doble conteo.
- **Riesgo de regresión:** muy alto; requiere rollout por consumidor.

### OBS-FINAL-001 — Añadir telemetría y alertas externas

- **Prioridad/área:** P1 — Observabilidad
- **Problema:** buffers/logs del proceso no tienen retención ni alertas verificables.
- **Evidencia:** `src/lib/observability/*`; no hay sink/monitor configurado en repo.
- **Impacto:** fallos y drops desaparecen al reiniciar.
- **Dependencias:** OPS-FINAL-001 y configuración de entorno.
- **Alcance:** jobs, fuentes, DB, proyección, notificaciones y módulos.
- **Criterio de aceptación:** eventos exportados, SLO/alerta, correlación request/run/source e historial tras reinicio.
- **Pruebas requeridas:** fallo sintético en staging y recepción de alerta.
- **Riesgo de regresión:** medio; riesgo de PII en telemetría.

### OPS-FINAL-002 — Probar backup, restore y rollback

- **Prioridad/área:** P1 — Continuidad
- **Problema:** no hay evidencia ejecutable de recuperación.
- **Evidencia:** solo planes; `vercel.json` vacío; entorno externo no accesible.
- **Impacto:** pérdida/corrupción sin recuperación demostrada.
- **Dependencias:** entorno staging y responsables definidos por el usuario.
- **Alcance:** DB, código, workflows, flags, fuentes y migraciones.
- **Criterio de aceptación:** restore medido, RPO/RTO, rollback ensayado y evidencia fechada.
- **Pruebas requeridas:** restauración de copia, rollback de release y desactivación de jobs.
- **Riesgo de regresión:** alto si se prueba fuera de staging; jamás usar producción.

### SCRIPT-FINAL-001 — Guardar scripts de reparación/escalación

- **Prioridad/área:** P1 — Operaciones/seguridad
- **Problema:** `repairGdacsGreenSeverity --apply` y `promoteOwnerRole` escriben sin el guard fail-closed usado por seed.
- **Evidencia:** búsqueda de escrituras Prisma en `scripts/`; ambos reportan `guard=False`.
- **Impacto:** mutación accidental de base remota o privilegios.
- **Dependencias:** reutilización de política de destino segura, con reglas específicas.
- **Alcance:** scripts npm/manuales y documentación operativa.
- **Criterio de aceptación:** dry-run default, entorno/destino/confirmación fuerte, auditoría y pruebas sin DB.
- **Pruebas requeridas:** producción/Supabase bloqueados, staging confirmado, dry-run cero writes.
- **Riesgo de regresión:** medio.

## Fase 2 — público limitado

### MOD-FINAL-001 — Deshabilitar o rotular capacidades simuladas

- **Prioridad/área:** P1 — Producto/módulos
- **Problema:** ARCA/HERMES/AURA y previews prometen capacidad operativa con datos demo.
- **Evidencia:** `argusModules.ts` maturityNotes y capabilitiesPreview; módulos/data.
- **Impacto:** decisiones sobre refugios, rutas o capacidad sanitaria ficticia.
- **Dependencias:** DATA-FINAL-001.
- **Alcance:** registry, badges, rutas directas y módulos públicos.
- **Criterio de aceptación:** preview persistente o disabled; ninguna cifra demo se presenta como live.
- **Pruebas requeridas:** rutas directas, flags, accesibilidad y snapshots UI.
- **Riesgo de regresión:** bajo.

### PUB-FINAL-001 — Alinear afirmaciones públicas con capacidad real

- **Prioridad/área:** P2 — Producto/documentación
- **Problema:** previews incluyen tiempo real/capacidad aunque las notas reconocen demo.
- **Evidencia:** `src/data/argusModules.ts:89-95,124-130,228,275`.
- **Impacto:** expectativa engañosa.
- **Dependencias:** MOD-FINAL-001.
- **Alcance:** UI y documentación pública, sin inventar nuevas capacidades.
- **Criterio de aceptación:** cada claim clasificado accurate/partial/preview y visible en contexto.
- **Pruebas requeridas:** revisión de copy contra matriz de producción.
- **Riesgo de regresión:** bajo.

## Fase 3 — madurez institucional

### RBAC-FINAL-001 — Modelar roles institucionales reales

- **Prioridad/área:** P2 — Identidad/RBAC
- **Problema:** POLICE, AUTHORITY, MEDICAL_OPERATOR, LOGISTICS e INSTITUTIONAL_ADMIN no existen en la sesión Prisma real.
- **Evidencia:** `mapSessionUserToArgusRole()` solo mapea roles actuales.
- **Impacto:** módulos institucionales no tienen onboarding/autorización real.
- **Dependencias:** gobernanza de identidad.
- **Alcance:** schema/migración futura, administración, APIs y auditoría.
- **Criterio de aceptación:** rol emitido server-side, lifecycle de acceso y revocación probados.
- **Pruebas requeridas:** matriz RBAC y rol cliente falso.
- **Riesgo de regresión:** alto.

### AUD-FINAL-001 — Persistir auditoría de módulos sensibles

- **Prioridad/área:** P2 — Auditoría
- **Problema:** `auditModuleAccess` no persiste y no loguea en producción; CUSTOS usa demo audit.
- **Evidencia:** `src/lib/modules/moduleAccess.ts` y `src/modules/custos/*`.
- **Impacto:** falta trazabilidad institucional.
- **Dependencias:** RBAC-FINAL-001 y política de retención.
- **Alcance:** CUSTOS, ATLAS, ORÁCULO, TALOS, FÉNIX y NEXUS.
- **Criterio de aceptación:** acceso/acción/motivo persistidos y consultables solo por admin.
- **Pruebas requeridas:** redacción PII, autorización y retención.
- **Riesgo de regresión:** alto por privacidad.

### QA-FINAL-001 — Completar gates de calidad

- **Prioridad/área:** P2 — Calidad/CI
- **Problema:** falta script typecheck y lint conserva 20 warnings.
- **Evidencia:** comandos de validación.
- **Impacto:** gate inconsistente.
- **Dependencias:** REL-FINAL-001.
- **Alcance:** package scripts/CI y warnings.
- **Criterio de aceptación:** test:p0, test, typecheck, lint y build pasan desde checkout limpio.
- **Pruebas requeridas:** pipeline CI.
- **Riesgo de regresión:** bajo.

### NOTIF-FINAL-001 — Definir persistencia de estado leído

- **Prioridad/área:** P2 — Notificaciones
- **Problema:** IDs leídos viven en `localStorage`.
- **Evidencia:** `NotificationCenterPanel.tsx:15-46`.
- **Impacto:** UX inconsistente entre dispositivos; no es estado operacional.
- **Dependencias:** autenticación y privacidad.
- **Alcance:** API/cliente o documentación explícita local-only.
- **Criterio de aceptación:** comportamiento declarado y testeado.
- **Pruebas requeridas:** dispositivo/sesión y límites de IDs.
- **Riesgo de regresión:** bajo.

## Fase 4 — optimización

### ARCH-FINAL-001 — Consolidar registries/allowlists duplicados

- **Prioridad/área:** P3 — Mantenibilidad
- **Problema:** registries VIGÍA/operaciones y allowlists oficiales se sincronizan manualmente.
- **Evidencia:** comentarios en `sourceOperationsRegistry.ts` y `canonicalIncidentGateway.ts`.
- **Impacto:** drift futuro.
- **Dependencias:** DATA-FINAL-002.
- **Alcance:** metadata compartida sin alterar contratos.
- **Criterio de aceptación:** una definición tipada por concepto y tests anti-drift.
- **Pruebas requeridas:** snapshots de registry.
- **Riesgo de regresión:** medio.

### PERF-FINAL-001 — Medir bundle/carga y resolver warnings React

- **Prioridad/área:** P3 — Rendimiento/frontend
- **Problema:** 20 warnings `set-state-in-effect`; no hay evidencia de presupuesto de bundle/carga.
- **Evidencia:** `npm run lint` y build incompleto.
- **Impacto:** renders en cascada y riesgo móvil.
- **Dependencias:** REL-FINAL-001.
- **Alcance:** efectos señalados y medición de mapa/Orbit.
- **Criterio de aceptación:** warnings justificados/cero y budgets registrados.
- **Pruebas requeridas:** lint, profiler y Lighthouse controlado.
- **Riesgo de regresión:** medio.

## Conteo

| Prioridad | Cantidad |
|---|---:|
| P0 | 2 |
| P1 | 11 |
| P2 | 5 |
| P3 | 2 |
