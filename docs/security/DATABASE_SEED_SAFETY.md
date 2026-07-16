# Seguridad del seed de base de datos (`prisma/seed.ts`)

> Resuelve el hallazgo P0 de la auditoría (`docs/audit/ARGUS_MASTER_BACKLOG.md`, ítem P0.2): `db:seed` no estaba protegido contra ejecutarse accidentalmente contra la base de datos compartida (Supabase) o contra producción.

## Qué comandos están protegidos

| Comando | Protección |
|---|---|
| `npm run db:seed` | Doble: `scripts/guardSeedDatabase.ts` corre primero (defensa en profundidad a nivel npm), y `prisma/seed.ts` valida el destino de nuevo internamente antes de tocar Prisma |
| `tsx prisma/seed.ts` (invocación directa, sin pasar por npm) | Protegido — el guard es la primera línea ejecutada dentro de `run()`, antes de que el archivo importe `src/lib/prisma` o `@prisma/client` |
| `npx prisma db seed` | Este repositorio **no tiene** configurado `"prisma": { "seed": ... }` en `package.json`, por lo que hoy este comando falla inmediatamente con "no seed script configured" y nunca llega a ejecutar nada. Si en el futuro se agrega esa configuración apuntando a `prisma/seed.ts`, queda protegido automáticamente por el mismo guard interno, sin cambios adicionales |
| `npm run db:setup:local`, `npm run db:reset:local:danger` | Ya llamaban a `scripts/guardLocalDatabase.ts` (guard más estricto, solo permite SQLite/`localhost`/`127.0.0.1`, sin excepciones remotas) y terminan invocando `npm run db:seed`, por lo que heredan automáticamente la protección nueva también |

## Qué entornos quedan bloqueados

- **Producción**: `NODE_ENV=production` o `VERCEL_ENV=production` bloquean siempre, sin importar cómo luzca la URL configurada.
- **Cualquier host remoto no confirmado explícitamente**, incluyendo:
  - Cualquier host con patrón Supabase (`*.supabase.co`, `*.pooler.supabase.com`, `*.supabase.in`) — **bloqueado sin excepción**, incluso si se configuran las variables de autorización remota. Supabase nunca se autoriza automáticamente ni por override.
  - Cualquier otro host que no sea `localhost` / `127.0.0.1` / `::1` — bloqueado salvo que se confirme explícitamente (ver más abajo).
- **`DATABASE_URL` ausente, vacía o no interpretable como URL con host** — bloqueado.
- **`DIRECT_URL`**, si está definida, se valida con las mismas reglas que `DATABASE_URL` (debe ser igualmente local o igualmente confirmada como remota).

## Cómo funciona el guard

El guard vive en `scripts/lib/databaseSafety.ts`, exportando `assertSafeDatabaseForSeed()`. Es **fail-closed**: cualquier condición no reconocida explícitamente como segura termina el proceso con código de salida distinto de cero, y nunca permite continuar "por defecto".

Orden de evaluación:
1. Carga `.env`/`.env.local` (mismo comportamiento que `scripts/guardLocalDatabase.ts`, ahora compartido desde este mismo módulo).
2. Si `NODE_ENV` o `VERCEL_ENV` indican producción → bloquea.
3. Si `DATABASE_URL` falta o está vacía → bloquea.
4. Si `DATABASE_URL` (o `DIRECT_URL`, si está presente) no se puede interpretar como URL con host → bloquea.
5. Si el host es `localhost`/`127.0.0.1`/`::1` (todas las URLs configuradas) → **permite**.
6. Si el host coincide con un patrón Supabase → bloquea, sin excepción posible.
7. Si el host es remoto y no-Supabase: solo permite si **ambas** variables coinciden:
   - `ARGUS_ALLOW_REMOTE_SEED=true`
   - `ARGUS_SEED_CONFIRM_HOST=<host exacto>` (debe ser textualmente igual al host de `DATABASE_URL`)
   Una sola de las dos no es suficiente — esto es intencional, para que un `.env` con `ARGUS_ALLOW_REMOTE_SEED=true` olvidado de una sesión anterior no autorice silenciosamente un host distinto.
8. Si nada de lo anterior aplica → bloquea (remoto no autorizado).

Este mismo guard se reutiliza (no se duplica) desde:
- `prisma/seed.ts` — protección principal, se ejecuta como la primera acción de `run()`, **antes** de cualquier `import()` de `src/lib/prisma` (que es lo que instancia `PrismaClient`). Los imports de Prisma y de `govIdentityProvider` son dinámicos (`await import(...)`) precisamente para que nunca se evalúen si el guard bloquea.
- `scripts/guardSeedDatabase.ts` — wrapper de defensa en profundidad encadenado en `npm run db:seed` antes de `tsx prisma/seed.ts`.
- `scripts/guardLocalDatabase.ts` — reutiliza únicamente la función de carga de `.env`/`.env.local` (`loadLocalEnvFiles`) de este mismo módulo; su propia política (más estricta: solo SQLite/localhost, sin override remoto posible) no fue modificada.

## Cómo validar un destino seguro

- **Local**: cualquier `DATABASE_URL`/`DIRECT_URL` cuyo host sea `localhost`, `127.0.0.1` o `::1` pasa automáticamente.
- **Remoto de staging, si es realmente necesario**: configurar ambas variables (`ARGUS_ALLOW_REMOTE_SEED=true` y `ARGUS_SEED_CONFIRM_HOST=<host exacto>`) únicamente en la sesión de shell donde se va a ejecutar el comando, nunca de forma permanente en `.env`/`.env.local` compartido. Nunca funciona contra un host Supabase.

## Producción y la base compartida nunca deben sembrarse

Esto no es opcional ni configurable: no existe ninguna combinación de variables que permita que el seed corra contra un entorno marcado como producción (`NODE_ENV`/`VERCEL_ENV`) ni contra un host con forma de Supabase. Si en algún momento se necesita repoblar datos de referencia en la base compartida de producción, debe hacerse mediante un proceso separado, revisado y explícitamente distinto de `prisma/seed.ts` — este archivo está pensado únicamente para datos de demostración en una base local aislada.

## Cómo interpretar los errores

Cuando el guard bloquea, imprime un bloque `ARGUS SEED BLOCKED` con:
- el motivo exacto del bloqueo;
- el entorno detectado (`production`, `unknown`, etc.);
- el host afectado, **sanitizado** (nunca la URL completa, nunca usuario/contraseña/query string);
- confirmación de que no se creó ningún `PrismaClient` ni se ejecutó ninguna operación.

Si el bloqueo es inesperado, revisar (en orden): `NODE_ENV`/`VERCEL_ENV`, que `DATABASE_URL` esté bien formada, y si el destino es intencionalmente remoto, que ambas variables de confirmación estén presentes y coincidan exactamente con el host.

## Qué sigue siendo responsabilidad del propietario

- Nunca commitear un `.env`/`.env.local` con `ARGUS_ALLOW_REMOTE_SEED=true` seteado.
- Revisar antes de cada uso manual de `db:seed` que `DATABASE_URL` apunte efectivamente al Postgres local esperado y no a una URL heredada de una sesión anterior.
- Si se agrega en el futuro un comando destructivo nuevo (otro script de reset, migración de datos, limpieza masiva), integrarlo explícitamente con `assertSafeDatabaseForSeed()` (o una variante equivalente) en vez de asumir que queda cubierto automáticamente.
- Auditar periódicamente (`npm run audit:prod-seed`) que no haya datos de seed/demo persistidos en la base compartida, independientemente de este guard.

## Hallazgo pendiente (fuera de alcance de esta tarea)

`scripts/auditProdSeedData.ts` (detector de datos seed/demo ya persistidos) sigue siendo manual-only, sin hook de CI/cron — ya registrado como ítem P2 en `docs/audit/ARGUS_MASTER_BACKLOG.md`. No se amplía en esta tarea.
