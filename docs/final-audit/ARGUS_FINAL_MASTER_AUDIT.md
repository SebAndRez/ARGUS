# ARGUS — auditoría maestra final

**Fecha:** 2026-07-15  
**Árbol auditado:** estado de trabajo sin commit posterior a Prompts 1–20  
**Veredicto:** **NO-GO**  
**Preparación:** **47/100**

## Resumen ejecutivo

ARGUS es hoy una aplicación Next.js extensa con autenticación firmada, persistencia Prisma/PostgreSQL, 168 archivos de rutas API (188 métodos), 43 fuentes inventariadas, dos schedulers GitHub Actions, una proyección compartida de `KnowledgeIncident` a `ArgusEvent`, módulos verticales de madurez desigual y una suite Vitest local amplia. No es todavía una plataforma confiable para operación de crisis.

Los Prompts 1–20 mejoraron materialmente los tres endpoints mutantes originalmente expuestos, el seed, el aislamiento demo de notificaciones, RBAC de APIs de módulos, mapeo, lifecycle, locks, correlación wildfire, tests y observabilidad interna. Sin embargo, el árbol actual contiene dos P0 y el build de producción falla. El mapa/Orbit inicializa y conserva `demoArgusEvents` aun cuando producción prohíbe demo; además mezcla ese fallback con incidentes persistidos. `GET /api/help-requests` entrega sin autenticación el registro completo, incluidas descripción y coordenadas exactas de solicitudes de auxilio. Ninguna de estas condiciones permite un piloto.

SENAPRED usa un cliente y normalizador compartidos, pero no tiene propietario programado único: Global Watch y Chile Alerts se disparan cada 15 minutos en workflows distintos y ambos consultan la fuente. Los locks evitan simultaneidad, no las consultas secuenciales duplicadas. Los jobs también pueden devolver HTTP 200 con `status: "failed"`, por lo que los workflows los declaran exitosos.

El próximo hito no es desplegar. Es cerrar F0 del backlog: eliminar la mezcla demo del mapa/Orbit, restringir/redactar HelpRequest, restaurar build y corregir semántica/propiedad de jobs; luego repetir toda esta validación con evidencia de Redis, variables, migraciones, backups y monitoreo del entorno candidato.

## Alcance y metodología

- Solo lectura sobre código, configuración, pruebas, workflows, Prisma y documentos históricos.
- No se ejecutaron seed, migraciones, workflows, despliegues ni proveedores externos.
- Las pruebas se ejecutaron con `DATABASE_URL`/`DIRECT_URL` locales inválidas, demo deshabilitado y `fetch` bloqueado globalmente por `tests/setup.ts`.
- La documentación se usó solo como hipótesis; las conclusiones se contrastaron con código, imports, rutas, tests y resultados de comandos.
- El intento inicial de Git desde `D:\A.R.G.U.S` falló porque la raíz real es `D:\A.R.G.U.S\argus-grid`; los comandos se repitieron allí.

## Respuesta principal

**No.** ARGUS no puede desplegarse hoy como plataforma real de inteligencia y gestión de crisis sin riesgo de mostrar datos falsos, exponer ubicaciones sensibles, ocultar fallos de ingestión y omitir el release por un build no generable.

## Fuente de verdad e identidad de incidentes

1. La fuente más cercana a canónica para fuentes externas es `KnowledgeIncident` con `KnowledgeEvidence`.
2. No existe todavía una identidad universal: `KnowledgeIncident`, `ExternalEvent`, `Report`, `HelpRequest`, `RiskAssessment`, datos de conflicto y stores runtime siguen paralelos.
3. Existe una proyección compartida efectiva `canonicalKnowledgeIncidentToArgusEvent`; los wrappers de knowledge-intake y VIGÍA delegan en ella.
4. La proyección no unifica persistencia ni IDs de superficie: módulos usan el ID crudo, mientras `/api/argus/events`, `/api/chile-alerts` y `/api/vigia/events` agregan prefijos.
5. El mapa consume además `/api/events`, ingestors live y datasets cliente; por ello la proyección no es una vista única del sistema.
6. Hay riesgo de doble conteo y discrepancia entre mapa, Orbit, ATLAS, notificaciones y módulos mientras esos modelos y fetches paralelos sigan activos.

## Hallazgos vigentes

### PRIV-FINAL-001 — Solicitudes de auxilio con ubicación exacta son públicas

- **Prioridad:** P0
- **Área:** Privacidad/API
- **Estado:** OPEN
- **Evidencia:** `src/app/api/help-requests/route.ts:9-14` ejecuta `findMany()` sin guard y devuelve filas completas; la creación persiste `description`, `latitude`, `longitude` y `locationText` (`:27-47`). `src/app/api/reports/route.ts:9-14` hace lo mismo para reportes.
- **Impacto:** un anónimo puede enumerar mensajes, situación y ubicación precisa de personas que piden auxilio; habilita acoso, targeting y exposición de vulnerabilidad.
- **Reproducción:** inspeccionar el handler GET; no existe `getCurrentUser`, `requireOperator` ni proyección pública redactada antes de `NextResponse.json`.
- **Alcance:** todos los registros de `HelpRequest` y `Report` devueltos por esas rutas.
- **Recomendación:** separar contratos públicos/operador y aplicar redacción espacial y de texto por defecto.
- **Criterio de cierre:** tests anónimo/ciudadano/operador demuestran que anónimo nunca recibe descripción privada ni coordenada precisa, incluidos `restrictedMode=true`.

### DATA-FINAL-001 — El mapa y Orbit mezclan demo con datos reales en producción

- **Prioridad:** P0
- **Área:** Confianza de datos/mapa
- **Estado:** REGRESSED
- **Evidencia:** `src/app/app/page.tsx:392` inicializa `argusEvents` con `demoArgusEvents`; `:1879` usa el mismo dataset si `/api/argus/events` falla; `:1881-1896` concatena luego Chile Alerts/VIGÍA. Este camino cliente no invoca `isDemoDataAllowed()`.
- **Impacto:** alertas curadas/demo pueden aparecer como capa oficial antes del fetch, permanecer tras un fallo y convivir con incidentes persistidos; afecta también Orbit porque `GlobeView` recibe la misma colección.
- **Reproducción:** cargar `/app` con `/api/argus/events` fallando y `/api/vigia/events` devolviendo filas; el estado resultante contiene demo más real.
- **Alcance:** mapa 2D, Orbit 3D, conteos, selección y percepción de alertas oficiales.
- **Recomendación:** estado inicial vacío/no disponible y fallback demo solo bajo el guard explícito, rotulado y aislado de superficies operacionales.
- **Criterio de cierre:** test de producción con fetch fallido devuelve/renderiza cero demo; test con incidentes reales no concatena IDs demo.

### REL-FINAL-001 — Build de producción roto en `/dashboard`

- **Prioridad:** P1
- **Área:** Release/frontend
- **Estado:** REGRESSED
- **Evidencia:** `npm.cmd run build` compila y pasa TypeScript, pero falla al prerenderizar `/dashboard`; `AtlasDashboard.tsx:114` usa `useSearchParams()`, `src/app/dashboard/page.tsx:9` lo renderiza sin `Suspense`, mientras `/modules/atlas` sí lo envuelve.
- **Impacto:** no se puede producir un artefacto desplegable del árbol auditado.
- **Reproducción:** ejecutar `npm.cmd run build`.
- **Alcance:** release completo.
- **Recomendación:** alinear el límite de render de ambas rutas y añadir prueba de build.
- **Criterio de cierre:** build limpio en CI y smoke test de `/dashboard` y `/modules/atlas`.

### ING-FINAL-001 — SENAPRED conserva dos propietarios programados

- **Prioridad:** P1
- **Área:** Ingestión/SENAPRED
- **Estado:** CLOSED_PARTIAL
- **Evidencia:** `argus-global-watch.yml:12` corre a `3,18,33,48`; `argus-cron.yml:11` a `7,22,37,52`. `globalWatchEngine.ts:299-318,388` consulta SENAPRED y el job Chile Alerts también lo hace. El lock compartido solo bloquea solapamiento.
- **Impacto:** dos consultas lógicas y dos ciclos de upsert/telemetría cada 15 minutos; riesgo de doble notificación, costo, rate limit y estados de salud contradictorios.
- **Reproducción:** comparar ambos cron y seguir `runSenapredSource()`/`runChileAlertsIngestion()`.
- **Alcance:** fuente oficial SENAPRED, salud, notificaciones y persistencia.
- **Recomendación:** un propietario programado; el otro pipeline consume persistencia o resultado delegado.
- **Criterio de cierre:** prueba con ambos jobs demuestra una sola llamada al cliente en una ventana de cadencia.

### OPS-FINAL-001 — Los workflows aceptan fallos totales como éxito

- **Prioridad:** P1
- **Área:** Operaciones/jobs
- **Estado:** OPEN
- **Evidencia:** `runGlobalWatch()` puede retornar `status: "failed"`; `/api/jobs/run-global-watch/route.ts:58` responde 200. Chile Alerts hace lo mismo en `route.ts:54`. Ambos workflows consideran cualquier 2xx éxito.
- **Impacto:** caída total de fuentes puede quedar verde en GitHub Actions y sin intervención.
- **Reproducción:** mockear todas las fuentes fallidas sin lanzar excepción; el handler responde 200 con body failed.
- **Alcance:** ambos pipelines programados.
- **Recomendación:** mapear fallo total a 5xx; parcial a contrato/telemetría explícita.
- **Criterio de cierre:** tests verifican failed→5xx, partial_success→contrato definido y workflow falla ante failed.

### JOB-FINAL-001 — La clave de idempotencia no evita reejecución completada

- **Prioridad:** P1
- **Área:** Concurrencia/idempotencia
- **Estado:** CLOSED_PARTIAL
- **Evidencia:** `runIdentity.ts` valida y reutiliza el header solo como `runId`; `jobLock.ts` elimina el lock al terminar. No existe registro duradero de resultado por clave. El mismo header después de release adquiere el lock y repite el pipeline.
- **Impacto:** reintentos tardíos o replay legítimo duplican consultas y efectos.
- **Reproducción:** ejecutar el handler dos veces secuenciales con la misma key; ambas llamadas alcanzan el motor.
- **Alcance:** Global Watch, Chile Alerts y ejecución manual VIGÍA.
- **Recomendación:** almacenar resultado/estado idempotente con TTL separado del lock.
- **Criterio de cierre:** la segunda llamada devuelve el resultado previo y el motor se invoca una sola vez.

### SEC-FINAL-002 — Endpoint diagnóstico SENAPRED público y sin rate limit

- **Prioridad:** P1
- **Área:** Seguridad operacional
- **Estado:** OPEN
- **Evidencia:** `src/app/api/argus/senapred/live/route.ts:31-65` realiza fetch live y devuelve señales/warnings/errors; no usa `requireOperator` ni rate limit. El lock evita concurrencia, no repetición.
- **Impacto:** anónimos pueden amplificar consultas externas y obtener detalle diagnóstico.
- **Reproducción:** GET sin sesión; llega al lock y al cliente.
- **Alcance:** SENAPRED/AppSync y superficie pública.
- **Recomendación:** restringir a operador, acotar parámetros y aplicar rate limit.
- **Criterio de cierre:** anónimo 401/403 y no se invoca el proveedor.

### SEC-FINAL-003 — Rate limiting cubre una minoría de la API

- **Prioridad:** P1
- **Área:** Seguridad/disponibilidad
- **Estado:** CLOSED_PARTIAL
- **Evidencia:** 17 de 168 archivos de ruta invocan `enforceRateLimit`; existen 77 archivos mutantes. Ingestores GET públicos y cómputos como predictive/normalize/reason/similarity quedan sin límite. Backend distribuido requiere Upstash; no hay evidencia de configuración de producción.
- **Impacto:** abuso, costo de proveedor, CPU/DB y saturación; protección no demostrada multi-instancia.
- **Reproducción:** inventario estático por imports/calls y ausencia de variables verificables de producción.
- **Alcance:** API pública y operador no cubierta.
- **Recomendación:** política por clase de ruta y gate de release que enumere cobertura.
- **Criterio de cierre:** matriz 100% clasificada y pruebas de denegación antes del efecto para rutas costosas/críticas.

### DATA-FINAL-002 — Persistencia y consumidores siguen fragmentados

- **Prioridad:** P1
- **Área:** Datos/arquitectura
- **Estado:** CLOSED_PARTIAL
- **Evidencia:** Prisma mantiene `Report`, `HelpRequest`, `ExternalEvent`, `RiskAssessment`, `KnowledgeIncident` y otros modelos paralelos. El mapa hace fetch de `/api/events`, ingestors directos y tres endpoints Argus; los módulos conservan datos propios y panel canónico aditivo.
- **Impacto:** omisiones, IDs divergentes, doble conteo y lifecycle inconsistente.
- **Reproducción:** seguir fetches de `src/app/app/page.tsx:1647-2213` y gateways de módulos.
- **Alcance:** mapa, Orbit, ATLAS/VIGÍA/ORÁCULO/TALOS, notificaciones y Command Center.
- **Recomendación:** completar migración por consumidor con una vista canónica y contratos de compatibilidad.
- **Criterio de cierre:** un incidente produce el mismo ID, severidad, lifecycle y geometría en todas las superficies elegibles.

### OBS-FINAL-001 — Observabilidad no tiene alerta/retención externa verificable

- **Prioridad:** P1
- **Área:** Observabilidad/operaciones
- **Estado:** CLOSED_PARTIAL
- **Evidencia:** health y snapshot de operador existen, pero eventos recientes se sostienen en buffers/logs del proceso; no hay sink, alertas, dashboard externo ni retención demostrada. Producción Redis, crons y Source Health no fueron accesibles.
- **Impacto:** fallos intermitentes o pérdida de proceso pueden borrar diagnóstico; no hay evidencia de guardia activa.
- **Reproducción:** inventariar `src/lib/observability/*` y workflows.
- **Alcance:** pipelines, fuentes, proyección y módulos.
- **Recomendación:** exportación estructurada, alertas por SLO y runbook con responsables.
- **Criterio de cierre:** prueba de alerta end-to-end y consulta histórica tras reinicio.

### OPS-FINAL-002 — Backup, restore y rollback operacional no demostrados

- **Prioridad:** P1
- **Área:** Continuidad
- **Estado:** INSUFFICIENT_EVIDENCE
- **Evidencia:** hay planes/documentos, pero no evidencia ejecutable de backup, retención, restore probado, migración del entorno candidato ni flags efectivos para apagar mapa/jobs/fuentes. `vercel.json` está vacío.
- **Impacto:** no hay recuperación demostrada ante corrupción o release fallido.
- **Reproducción:** revisión de configuración y documentación; no se accedió a Supabase/Vercel.
- **Alcance:** toda la plataforma.
- **Recomendación:** runbook probado en staging y evidencia fechada de restore/rollback.
- **Criterio de cierre:** restauración ensayada, RPO/RTO medidos y rollback de código/jobs/migración ejecutado en staging.

### MOD-FINAL-001 — Capacidades demo/preview siguen presentadas como activas

- **Prioridad:** P1
- **Área:** Producto/módulos
- **Estado:** CLOSED_PARTIAL
- **Evidencia:** ARCA usa siempre refugios demo y rutas demo pero `status:"active"`/badge de base pública; HERMES retorna geometría demo; AURA usa ocho puntos médicos fijos; CUSTOS es demo explícito; NEXUS es placeholder. `argusModules.ts` contiene notas honestas, pero los previews incluyen “capacidad y disponibilidad en tiempo real”.
- **Impacto:** el usuario puede interpretar capacidades simuladas como operacionales.
- **Reproducción:** contrastar registry, componentes y ausencia de APIs/consumidores reales.
- **Alcance:** módulos públicos y marketing dentro del producto.
- **Recomendación:** deshabilitar o etiquetar inequívocamente preview; no usar badge “active/success” para datos ficticios.
- **Criterio de cierre:** ninguna capacidad demo aparece en superficie operacional sin label persistente y aislamiento técnico.

### QA-FINAL-001 — Quality gate incompleto

- **Prioridad:** P2
- **Área:** Calidad
- **Estado:** OPEN
- **Evidencia:** `npm run typecheck` no existe; `tsc --noEmit` pasa. Lint pasa con 20 warnings. Vitest pasa 839 tests, pero usa mocks y no prueba infraestructura real.
- **Impacto:** CI no puede ejecutar el comando obligatorio documentado y warnings pueden ocultar degradaciones.
- **Reproducción:** comandos del reporte de validación.
- **Alcance:** release/CI.
- **Recomendación:** declarar el script y fijar budgets/gates de warnings.
- **Criterio de cierre:** `npm run typecheck`, lint cero errores con umbral acordado, test y build pasan en CI.

### UX-FINAL-001 — Estado leído de notificaciones es local al dispositivo

- **Prioridad:** P2
- **Área:** Notificaciones/UX
- **Estado:** OPEN
- **Evidencia:** `NotificationCenterPanel.tsx:15,29-46` guarda IDs en `localStorage` y los envía por query.
- **Impacto:** el leído se pierde/cambia entre dispositivos; no altera lifecycle operacional.
- **Reproducción:** marcar leído y abrir otra sesión/dispositivo.
- **Alcance:** UX de notificaciones.
- **Recomendación:** persistencia por usuario o declarar alcance local.
- **Criterio de cierre:** contrato explícito y prueba multi-dispositivo si se promete sincronización.

## Madurez por dominio

| Dominio | Nivel | Evidencia |
|---|---:|---|
| Seguridad API | 3 | Guards reales; cobertura/rutas públicas críticas incompletas. |
| Autenticación/RBAC | 3 | Cookie HMAC y APIs server-side; roles institucionales no existen en modelo real. |
| Ingestión | 3 | Pipelines implementados; ownership/semántica de fallo defectuosos. |
| Datos canónicos | 3 | KnowledgeIncident + mapper; modelos y IDs paralelos. |
| Lifecycle | 4 | Política compartida y tests; almacenamiento aún en JSON/vocabularios paralelos. |
| Correlación | 3 | Wildfire determinista con tests; ejecución real no verificada. |
| Fuentes | 3 | 43 registradas, 8 scheduled; cero fuente verificada operacionalmente en producción. |
| Mapa 2D | 2 | Datos reales parciales mezclados con demo. |
| Orbit 3D | 2 | Misma colección, pero filtra solo high/critical y hereda demo. |
| Notificaciones | 4 | Taxonomía/guard/tests sólidos; infraestructura real no verificada. |
| Módulos principales | 3 | Contexto canónico aditivo; build Atlas roto y legacy activo. |
| Módulos secundarios | 2 | Mayormente demo/preview/placeholder. |
| Observabilidad | 3 | Health/snapshot/logs; sin retención/alertas externas. |
| Tests | 4 | 839 pasan; mocks, sin carga ni infraestructura. |
| Operaciones | 2 | Workflows/runbooks; HTTP semántico, backups y rollback insuficientes. |
| Privacidad | 1 | HelpRequest/report completos públicos. |
| Recuperación | 1 | Planes sin restauración demostrada. |

## Puntuación

| Categoría | Peso | Nota | Justificación |
|---|---:|---:|---|
| Seguridad | 20 | 10 | Mejoras reales, pero P0 de exposición y rutas costosas abiertas. |
| Datos e incidentes | 15 | 8 | Mapper/lifecycle mejoran; demo y fragmentación impiden confianza. |
| Ingestión y fuentes | 15 | 8 | Ocho fuentes scheduled; SENAPRED duplicado y producción no verificable. |
| Operaciones | 15 | 3 | Build roto, fallos 200, sin restore/rollback probado. |
| Tests | 10 | 8 | 839/839; typecheck script ausente y sin infraestructura. |
| Módulos | 10 | 4 | Integración parcial; muchos preview/demo. |
| Observabilidad | 10 | 5 | Baseline interno útil, sin alertas/retención externa. |
| Privacidad | 5 | 1 | Exposición pública de solicitudes sensibles. |
| **Total** | **100** | **47** | P0 limita máximo a 49. |

## Evolución desde la auditoría original

| Área | Auditoría original | Estado actual | Evolución |
|---|---|---|---|
| Seguridad | 3 mutantes P0; sin rate limit | Tres guards cerrados; nuevo P0 privacidad y cobertura parcial | mejoró |
| Tests | Cero suite ejecutable | 75 archivos/839 tests | mejoró |
| Incidentes | Sin entidad/proyección común | KnowledgeIncident + mapper; modelos paralelos | mejoró |
| SENAPRED | Clientes/pipelines duplicados | Cliente único, schedulers aún dobles | mejoró |
| Incendios | Sin correlación | Correlación/geometry con tests | mejoró |
| Fuentes | Pocas programadas, catálogo ambiguo | Registro de 43 y scheduler explícito; producción no verificada | mejoró |
| Módulos | FÉNIX duplicado, demos no claros | FÉNIX unificado; madurez visible, varios demos activos | mejoró |
| Observabilidad | Mínima | Health, snapshot, eventos y tests | mejoró |
| Deuda técnica | Legacy y tests inertes | Limpieza amplia; fragmentación/build regresado | mejoró |
| Producción | NO-GO | NO-GO por dos P0 y build | sin cambio |

## Limitaciones

No se verificaron variables ni secretos de Vercel/GitHub, estado o migraciones de Supabase, datos históricos, ejecuciones reales de cron, Redis/Upstash, backups, restauración, latencia/costos/cuotas de proveedores, contratos/licencias, carga/concurrencia multi-instancia, navegadores/dispositivos, push, geolocalización real ni políticas humanas de guardia. Ausencia de evidencia no se trató como aprobación.

## Veredicto y alcance

**NO-GO para público, piloto e institución.** No se autoriza ninguna superficie operacional del árbol actual. Solo son aceptables desarrollo local aislado, demos explícitas sin datos reales y revisión interna sin usuarios/incident response. Deben permanecer apagados mapa/Orbit operacional, schedulers, ingesta live, notificaciones operacionales y todos los módulos públicos/institucionales hasta cerrar P0 y P1 de Fase 1.
