# ARGUS — Baseline de Rate Limiting

**Fecha**: 2026-07-14
**Tipo**: implementación de seguridad backend — rate limiting centralizado para endpoints de alto riesgo.
**Alcance**: no se modificó `prisma/schema.prisma`, no se crearon migraciones, no se cambió Global Watch/deduplicación/notificaciones/módulos/lifecycle, no se hizo commit ni push.

---

## 1. Arquitectura

```text
Endpoint (route.ts)
  → requireOperator()/requireAuth() [si aplica]
  → enforceRateLimit({ policy, request, identity })   ← src/lib/security/rateLimit.ts
      → getRateLimitRule(policy)                       ← src/lib/security/rateLimitPolicy.ts (única tabla)
      → determineRateLimitBackendKind()                ← src/lib/security/rateLimitBackend.ts
          distributed | memory-development | unavailable
      → incrementDistributedCounter() | incrementMemoryCounter()
      → resuelve allowed/limit/remaining/resetAt/retryAfterSeconds/backend
  → rateLimitResponseForOutcome(outcome)  → 429 | 503 | null (continuar)
  → validación de payload/bbox (cuando aplica)
  → operación protegida (Overpass, persistencia, hashing de password, etc.)
```

`src/lib/security/rateLimitPolicy.ts` es la **única** fuente de verdad de `route class / limit / window / failure mode / key strategy` — antes de esta tarea existía pero tenía cero consumidores en todo el repo (confirmado por búsqueda exhaustiva antes de modificarlo); se reemplazó su tabla de "buckets" genéricos sin relación con ningún endpoint real por 11 políticas nombradas, una por endpoint/clase de endpoint.

## 2. Infraestructura encontrada

- **Almacenamiento distribuido existente**: ninguno (sin Redis/Upstash/Vercel KV en `package.json` ni variables relacionadas en `.env.example` antes de esta tarea).
- **Implementación elegida**: Opción B — Upstash Redis REST (`@upstash/redis`, `^1.38.0`), compatible con instancias serverless de Vercel (HTTP/REST, no requiere conexión TCP persistente, funciona en runtime Node de todas las rutas tocadas — ninguna ruta usa Edge runtime).
- **Fallback**: contador en memoria del proceso, exclusivamente para desarrollo/tests/preview — nunca se declara protección de producción.
- **Comportamiento de producción**: sin `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` configurados, `determineRateLimitBackendKind()` devuelve `"unavailable"` en producción — las políticas `fail_closed` responden `503` sin ejecutar la operación protegida; las políticas `fail_open_local` se degradan a memoria en vez de bloquear.

## 3. Tabla de políticas

| Política | Endpoint(s) | Límite | Ventana | Clave | Failure mode |
|---|---|---:|---:|---|---|
| `knowledge_import_manual` | `POST /api/knowledge-intake/import/manual` | 10 | 600s | `route + userId` | fail_closed → 503 |
| `knowledge_import_file` | `POST /api/knowledge-intake/import/file` | 5 | 600s | `route + userId` | fail_closed → 503 |
| `critical_pois_sync` | `POST /api/critical-pois/sync` | 3 | 900s | `route + userId` | fail_closed → 503 |
| `vigia_manual_run` | `POST /api/vigia/run` | 3 | 900s | `route + userId` | fail_closed → 503 |
| `chile_alerts_manual_run` | `POST /api/chile-alerts/run` | 3 | 900s | `route + userId` | fail_closed → 503 |
| `auth_login_ip` | `POST /api/auth/login` (capa 1) | 10 | 600s | `route + IP normalizada` | fail_closed → 503 |
| `auth_login_account` | `POST /api/auth/login` (capa 2) | 5 | 600s | `route + hash(email normalizado)` | fail_closed → 503 |
| `auth_register_ip` | `POST /api/auth/register` | 5 | 3600s | `route + IP normalizada` | fail_closed → 503 |
| `mobile_safety_signal` | `POST /api/mobile-safety/{quake-event,check-in,escalate}`, `POST /api/mobile/{device/register,events}` | 60 | 60s | `route + IP normalizada` | fail_open_local → memoria |
| `sensor_safety_signal` | `POST /api/sensor-safety/{detections,check-ins,escalate,demo}` | 120 | 60s | `route + IP normalizada` | fail_open_local → memoria |
| `quakesense_signal` | `POST /api/quakesense/signals` | 60 | 60s | `route + IP normalizada` | fail_open_local → memoria |

La clave real siempre incluye también el `pathname` de la ruta (`rl:{policy}:{routePath}:{identidad}`), así que dos endpoints que comparten la misma política (p. ej. los tres de `mobile-safety`) nunca comparten cupo entre sí — cada uno tiene su propio contador.

Login aplica **dos** políticas independientes en la misma solicitud (Prompt 12 §13): la de IP debe permitir **y** la de cuenta debe permitir; cualquiera de las dos puede bloquear.

## 4. Estrategia de identidad

- **Usuario autenticado** (imports, sync de POI, ejecuciones manuales): `route + userId` de la sesión ya validada por `requireOperator()`. Si la política es `"user"` y no hay `userId`, `enforceRateLimit` lanza un error de programación (nunca construye una clave sin identidad).
- **Anónimo** (mobile/sensor/quakesense, registro): `route + IP normalizada` (`src/lib/security/clientIdentity.ts`).
- **Login**: IP + hash del email normalizado (nunca el email en texto plano).
- **IP sin resolver**: todas las solicitudes sin IP válida de una misma ruta comparten UN cupo restringido (`unresolved-ip`) — nunca un bypass ilimitado.

### Resolución de IP

Solo se leen `x-forwarded-for` (primer valor de la lista) y, como respaldo, `x-real-ip` — ambos headers que en Vercel los escribe el proxy de borde, no el cliente. Nunca se usa `User-Agent`, query params, body, ni headers personalizados no controlados por un proxy. Se valida forma IPv4/IPv6, se limita longitud (45 caracteres), se recortan espacios/puertos/corchetes.

### Hash de identificadores

`hashIdentifier()` (SHA-256, normalización previa a minúsculas/trim) — usado únicamente para el email en la política `auth_login_account`. No sustituye autenticación real, solo agrupa intentos de la misma cuenta sin enviar el email al backend del limitador.

## 5. Headers

```text
RateLimit-Limit       — límite de la ventana actual
RateLimit-Remaining    — solicitudes restantes (nunca negativo)
RateLimit-Reset        — SEGUNDOS restantes hasta que la ventana se reinicia (delta, no timestamp absoluto)
Retry-After             — solo presente cuando la solicitud fue rechazada (429); segundos, nunca negativo
```

Todas expresadas en segundos-delta respecto al momento de construir la respuesta — nunca un timestamp absoluto (Prompt 12 §16).

## 6. Comportamiento 429 vs 503

- **429** (`rateLimitExceededResponse`): la solicitud superó su cuota normal. Cuerpo:
  ```json
  { "error": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Try again later.", "retryAfterSeconds": 120 }
  ```
  Nunca incluye clave interna, identidad, IP, ni detalles de infraestructura.
- **503** (`rateLimitServiceUnavailableResponse`): una política `fail_closed` necesitaba el backend distribuido y no estaba disponible (no configurado, o la llamada a Upstash falló). La operación protegida **nunca se ejecuta** en este caso. Cuerpo:
  ```json
  { "error": "SERVICE_UNAVAILABLE", "message": "This operation requires rate-limiting protection that is not currently available. Try again later." }
  ```
  Sin nombre de proveedor, host, ni credenciales.

`rateLimitResponseForOutcome(outcome)` decide cuál de las dos devolver (o `null` para continuar) — ningún endpoint reimplementa esta distinción.

## 7. Variables de entorno

```text
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Documentadas en `.env.example` sin valores reales. Sin ambas configuradas:
- fuera de producción → memoria de desarrollo (no autoritativa).
- en producción → rutas `fail_closed` responden 503; rutas `fail_open_local` se degradan a memoria.

## 8. Privacidad

- Nunca se registra IP completa, correo, tokens, cookies, payload ni secretos.
- Los logs (`console.warn`, solo en `rate_limit_blocked`/`rate_limit_backend_error`/`rate_limit_backend_unavailable` — nunca en cada solicitud permitida, para evitar ruido) incluyen únicamente: `policy`, `route`, `backend`, `env`.
- El backend activo (`distributed`/`memory-development`/`unavailable`) nunca se expone en respuestas públicas — solo en logs internos.
- El email en la política de cuenta de login se hashea (SHA-256) antes de formar parte de cualquier clave; nunca se envía en texto plano al backend del limitador.

## 9. Protecciones adicionales

- **Tamaño de payload** (`src/lib/security/payloadSizeGuard.ts`, basado en `Content-Length`, corre antes de leer/parsear el body): 2 MB para import manual, 8 MB para import de archivo (preview), 32 KB para señales móviles/sensores/QuakeSense. Limitación documentada: depende de que el cliente reporte `Content-Length` honestamente — no es un enforcement por streaming completo (fuera de alcance, Prompt 12 §18).
- **Bounding box** (`src/lib/security/boundingBoxGuard.ts`): para `/api/critical-pois/sync`, valida coordenadas finitas, rangos válidos (-90..90 / -180..180), `south < north`/`west < east`, y área máxima de 2.5° por eje — rechaza con 400 **antes** de llamar a Overpass. No se cambió el modelo de `CriticalPoi`.
- **Orden de ejecución**: en todos los endpoints tocados, el rate limit corre antes de leer archivos grandes, parsear contenido costoso, llamar Overpass, verificar contraseñas, o escribir en base de datos.

## 10. Endpoints revisados y no incluidos (con razón)

- **`/api/jobs/run-global-watch`, `/api/jobs/run-chile-alerts`** (cron protegido por `CRON_SECRET`): revisados, **no** se les agregó rate limiting. Razón: su frecuencia real está gobernada externamente (GitHub Actions, ~cada 15 min, documentado en `.env.example`), ya son fail-closed vía secreto exacto, y agregar un límite propio arriesga romper la superposición legítima entre el cron programado y un `workflow_dispatch` manual sin un beneficio de seguridad claro — el vector de abuso relevante (adivinar el secreto) ya está cerrado. Se documenta como decisión explícita, no como omisión.
- **`PATCH /api/mobile/check-in`, `PATCH /api/mobile-safety/check-in`, `PATCH /api/sensor-safety/*`**: requieren un `checkInId`/`id` válido preexistente (no pueden crear datos nuevos por fuerza bruta barata sin antes haber pasado por un endpoint POST ya limitado) — riesgo incremental bajo, excluidos por alcance.
- **`GET /api/mobile/push/preview`, `GET /api/mobile/device/capabilities`, `GET /api/sensor-safety/settings`**: solo lectura, sin escritura ni llamada a terceros, fuera del alcance de "endpoints de alto riesgo".
- **`/api/predictive/run`**: no mencionado explícitamente en el mandato (§3.3 solo nombra VIGÍA/Chile alerts); no se tocó para mantener el alcance estricto.

## 11. Observabilidad

```text
rate_limit_blocked              — solicitud rechazada por cuota normal
rate_limit_backend_error         — el backend distribuido configurado falló en tiempo de ejecución
rate_limit_backend_unavailable   — se requería backend distribuido y no había credenciales configuradas
```

No existe un evento `rate_limit_allowed` logueado individualmente — se evita el ruido de un log por cada solicitud permitida (Prompt 12 §20 lo permite explícitamente).

## 12. Diagnóstico

1. **¿Una operación devuelve 503 inesperadamente en producción?** Verificar que `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` estén configurados en el entorno de Vercel para esa política; revisar logs por `rate_limit_backend_unavailable` (falta configuración) vs `rate_limit_backend_error` (la credencial existe pero la llamada falló — posible caída de Upstash o token inválido).
2. **¿Un endpoint público (mobile/sensor) parece "sin límite" en producción?** Es esperado si no hay Upstash configurado — se degrada a memoria por proceso, que no es compartida entre instancias serverless; esto es una degradación documentada (fail_open_local), no un bug.
3. **¿Cómo confirmar qué backend está activo sin desplegar?** `determineRateLimitBackendKind()` es una función pura basada solo en variables de entorno — invocable en un script local con las mismas variables que produccion para verificar el resultado esperado antes de desplegar.
4. **¿Cómo ajustar un límite?** Editar únicamente `src/lib/security/rateLimitPolicy.ts` (`rateLimitRules`) — ningún endpoint declara su propio número.

## 13. Limitaciones conocidas

- El backend de memoria no es compartido entre instancias serverless — nunca debe interpretarse como protección real de producción (documentado explícitamente en el propio código y aquí).
- El guard de tamaño de payload confía en `Content-Length`; un cliente que mienta sobre su propio tamaño puede evadirlo puntualmente (mitigado igualmente por el rate limit de frecuencia).
- No se implementó control de concurrencia de jobs (explícitamente fuera de alcance, Prompt 12 §17 — "el control de concurrencia completo se realizará en el siguiente paso").
- Los umbrales del §12 son valores iniciales razonados por endpoint, no medidos contra tráfico real de producción — sujetos a ajuste.
