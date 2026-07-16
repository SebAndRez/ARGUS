# ARGUS — Matriz de Endpoints, Permisos y Riesgo

> Auditoría de solo lectura. No se imprimió ningún valor de secreto — solo nombres de variables de entorno. Estados según vocabulario obligatorio. Verificado el 2026-07-13. No existe `middleware.ts` en el repo: **cada `route.ts` es responsable individualmente de su propia autenticación**; no hay una puerta centralizada, ni siquiera a nivel de páginas.

## 1. P0 — Endpoints mutantes SIN autenticación (listados primero)

| Endpoint | Método | Evidencia | Impacto |
|---|---|---|---|
| `/api/knowledge-intake/import/manual` | POST | `route.ts:35-131` — sin `requireAuth`/`requireOperator`. `persist:true` dispara `saveKnowledgeDocument`, `upsertKnowledgeIncidentByExternalId`, `saveKnowledgeEvidence`, `saveKnowledgeLesson` (escrituras Prisma reales) | Cualquier usuario anónimo puede inyectar texto arbitrario como `KnowledgeIncident`/`KnowledgeEvidence` persistido en la base de conocimiento operacional |
| `/api/knowledge-intake/import/file` | POST | `route.ts:21-121` — sin auth. Mismo camino de persistencia que el anterior vía `rawMetadata.persist:true` | Segunda ruta anónima hacia las mismas escrituras de BD |
| `/api/critical-pois/sync` | POST | `route.ts:25-46` — sin auth. Llama `syncCriticalPoisForBbox` → `upsertCriticalPois` (persistencia real). El propio docstring (líneas 6-13) admite que está pensado para cron/uso manual, no navegador — pero no lo aplica | Cualquier llamador puede disparar llamadas ilimitadas a la API de Overpass (costo/DoS a terceros) y escribir en `CriticalPoi` para cualquier bbox, sin límite |

Los tres son **confirmado**: sin gate de sesión/rol y con escritura real a tablas no-demo.

## 2. Matriz completa (endpoints mutantes y de seguridad relevante; ~120 rutas GET públicas de solo lectura se omiten por ser consistentes con un producto de conciencia situacional público, sin auth, por diseño)

| Endpoint | Métodos | Acceso esperado | Acceso real (evidencia) | Protección | Riesgo |
|---|---|---|---|---|---|
| `/api/knowledge-intake/import/manual` | POST | Operador/Admin | Ninguno — `route.ts:35` | NINGUNA | **P0** |
| `/api/knowledge-intake/import/file` | POST | Operador/Admin | Ninguno — `route.ts:21` | NINGUNA | **P0** |
| `/api/critical-pois/sync` | POST | Operador/cron | Ninguno — `route.ts:25` | NINGUNA | **P0** |
| `/api/chile-alerts/run` | POST | Operador (sesión) | `requireOperator()` — `route.ts:37` | RBAC de sesión | P3 |
| `/api/jobs/run-chile-alerts` | GET/POST | Solo cron | Bearer `CRON_SECRET` — `route.ts:18-21` | Secreto compartido, fail-closed | P3 |
| `/api/jobs/run-global-watch` | GET/POST | Solo cron | Bearer `CRON_SECRET` — `route.ts:18-21` | Secreto compartido, fail-closed | P3 |
| `/api/vigia/run` | POST | Operador (sesión) | `requireOperator()` — `route.ts:19` | RBAC de sesión | P3 |
| `/api/vigia/source-health` | GET | Operador (sesión) | `requireOperator()` — `route.ts:13` | RBAC de sesión | P3 |
| `/api/admin/reports`, `/api/admin/sanctions` | POST | Admin | Chequeo de rol presente | RBAC de sesión | P3 |
| `/api/users/[id]` | PATCH | Operador + decisión RBAC | `requireOperator()` + `canChangeUserRole`/`canChangeAccountStatus` — `route.ts:13-41` | RBAC de sesión + autorización granular | confirmado, riesgo bajo |
| `/api/knowledge-intake/review/[id]` | POST | Operador | `requireOperator()`, `reviewerId` forzado server-side desde sesión (anti-spoofing explícito) — `route.ts:23-32` | RBAC de sesión | confirmado |
| `/api/knowledge-intake/jobs/*` (14 archivos `run-*`/`import-*`) | POST | Operador | Las 14 rutas llaman `requireOperator()` de forma uniforme | RBAC de sesión | confirmado |
| `/api/knowledge-intake/normalize`, `/reason`, `/similarity` | POST | Interno/herramienta | Sin auth, pero **sin persistencia** — cómputo/preview puro | NINGUNA, impacto bajo | P2 |
| `/api/predictive/run`, `/api/source-router/plan` | POST | Interno | Sin auth; sin persistencia, cómputo puro | NINGUNA | P2 |
| `/api/medical-aid` | POST | Público (SOS ciudadano) | Sin auth; `createDemoMedicalAidRequest`, etiquetado explícitamente `"Solicitud demo"` — no es despacho real | NINGUNA, **simulado** | P2 |
| `/api/mobile/*`, `/api/mobile-safety/*`, `/api/sensor-safety/*`, `/api/quakesense/signals` | POST/PATCH | Dispositivo/ciudadano | Sin auth; escriben en stores en memoria (`globalThis`), no Prisma; respuestas indican `"mode":"runtime_placeholder"` | NINGUNA, **simulado** | P2 |
| `/api/access/request` | POST | Público | Sin auth; valida/sanitiza pero **no persiste** | NINGUNA, **simulado** | P3 |
| `/api/auth/login`, `/register`, `/logout` | POST | Público (por diseño) | Sin pre-auth (esperado) | N/A | confirmado, por diseño |
| `/api/vesta/*`, `/api/reports/*`, `/api/help-requests/*`, `/api/trust/*`, `/api/profile/*` (todas las mutaciones) | varios | Ciudadano/operador autenticado | `requireAuth`/`requireOperator`/`requireVerifiedUser` confirmado en todas | RBAC de sesión | confirmado |
| ~120 rutas GET (`/api/knowledge-intake/live/*`, `/api/ingest/*`, `/api/argus/*`, `/api/command/*`, etc.) | GET | Lectura pública | Sin auth (por diseño) | NINGUNA (intencional) | confirmado, por diseño |

## 3. Mecanismo de autenticación de todo el sitio

- **No existe `middleware.ts`** en ninguna parte del repo (confirmado por búsqueda). No hay ni siquiera una puerta a nivel de páginas.
- Primitivas de auth en `src/lib/security/apiGuards.ts:11-38`: `requireAuth()`, `requireRole()`, `requireOperator()`, `requireAdmin()`, `requireVerifiedUser()`, `requireMedicalAccess()`, todas sobre `getCurrentUser()` (`src/services/authService.ts:46`).
- Sesión: cookie firmada HMAC `argus-grid-session` (`authService.ts:6,12-19`), firmada con `AUTH_SECRET`/`SESSION_SECRET`; el código falla ruidosamente si no hay secreto configurado, sin fallback inseguro — diseño sólido, confirmado.
- `src/lib/access/` contiene solo helpers de política/auditoría, no una puerta de request.
- Efecto neto: la corrección de autorización es **100% opt-in por ruta**. Los tres P0 son exactamente los casos donde ese opt-in se olvidó.

## 4. Compatibilidad CRON_SECRET vs ARGUS_CRON_SECRET

- Ambos workflows (`argus-cron.yml:22-29`, `argus-global-watch.yml:22-31`) envían `Authorization: Bearer ${ARGUS_CRON_SECRET}`, tomado del secreto de GitHub Actions `secrets.ARGUS_CRON_SECRET`.
- Ambos endpoints (`run-chile-alerts/route.ts:19`, `run-global-watch/route.ts:19`) comparan contra `process.env.CRON_SECRET` — un nombre distinto, pero **el mismo en ambos archivos**, y **documentado como intencional** en `.env.example:22-27`: "mismo secreto para ambos jobs; configurar en Vercel como `CRON_SECRET` y en GitHub como `ARGUS_CRON_SECRET` con el mismo valor."
- Veredicto: **confirmado**, sin discrepancia funcional entre los dos jobs hoy. Riesgo residual: **riesgo no comprobado** — la asimetría de nombres es fácil de mal configurar por un futuro operador; el fallo sería fail-closed (401), no una brecha de seguridad.

## 5. Idempotencia y concurrencia

- **No conectado**: no existe lock/mutex/idempotency-key en `globalWatchEngine.ts` ni `alertPromotionEngine.ts`.
- La idempotencia de facto viene de **upsert por externalId** (`upsertKnowledgeIncidentByExternalId`), no de locking real — protege contra filas duplicadas en reintentos (`--retry 2 --retry-delay 10` en los workflows), pero no contra condiciones de carrera si dos requests solapadas escriben el mismo `externalId` concurrentemente (gana la última escritura, sin transacción visible).
- Persistencia usa un pool de workers acotado (`PERSIST_CONCURRENCY`) con `Promise.all`, no una transacción atómica — ante timeout (`maxDuration=300`), las fuentes ya escritas quedan persistidas y las no alcanzadas se saltan hasta la siguiente corrida (escritura parcial "elegante", no todo-o-nada).

## 6. Hallazgos generales de seguridad

- **Secretos hardcodeados**: ninguno encontrado (barrido completo, falsos positivos verificados individualmente).
- **Fugas de stack trace/errores**: ninguna — patrón uniforme `error instanceof Error ? error.message : fallback` en todas las rutas muestreadas.
- **SSRF**: sin vector genuino. Los dos proxies server-side (`routing/google-directions`, `geocoding/search`) usan hosts hardcodeados; hallazgo menor: `origin`/`destination` se interpolan sin `encodeURIComponent` en `google-directions/route.ts:57` (riesgo no comprobado, severidad baja).
- **CORS**: sin headers `Access-Control-Allow-Origin` en ningún lugar — comportamiento por defecto same-origin del navegador, pero tampoco existe política explícita para consumidores legítimos cross-origin.
- **Rate limiting**: `src/lib/security/rateLimitPolicy.ts` define un esquema completo, pero su propio comentario admite que "la implementación real necesita almacenamiento en edge o Redis" y **nunca se importa fuera de su propio archivo** — **implementado pero no utilizado**. No hay límite de tasa en ningún endpoint, incluidos los tres P0.
- **Validación de entrada**: presente a nivel de forma/tipo en la mayoría de rutas mutantes muestreadas, pero eso no compensa la ausencia de verificación de identidad en los tres P0.

## 7. Top 5 hallazgos de esta fase

1. **P0** — `/api/knowledge-intake/import/manual` y `/api/knowledge-intake/import/file` aceptan escrituras no autenticadas en la base de conocimiento en vivo. Corrección: añadir `requireOperator()` igual que en las 14 rutas hermanas de `knowledge-intake/jobs/*`.
2. **P0** — `/api/critical-pois/sync` sin auth ni límite de tasa. Corrección: `requireOperator()` + límite por bbox.
3. **P1** — Ningún endpoint tiene rate limiting real pese a existir un esquema completo sin usar. Priorizar las dos rutas P0 y los endpoints móviles/sensor no autenticados.
4. **P2** — Asimetría de nombre `CRON_SECRET`/`ARGUS_CRON_SECRET` documentada solo en comentarios y `.env.example`, no en un runbook formal.
5. **P3** — Sin lock de idempotencia en los dos cron endpoints; solo upsert-based dedup, con posible condición de carrera en ejecuciones solapadas (`workflow_dispatch` manual + cron programado).
