# ARGUS — Línea Base de Acceso a Módulos (RBAC institucional simulado)

> Resuelve el hallazgo P0 de la auditoría (`docs/audit/ARGUS_MASTER_BACKLOG.md`, ítem P0.8): roles institucionales (`POLICE`, `AUTHORITY`, `INSTITUTIONAL_ADMIN`, `MEDICAL_OPERATOR`, `LOGISTICS`) podían activarse desde un selector de demostración en `localStorage`, sin respaldo de sesión real. **Esta NO es la implementación de un RBAC institucional definitivo** — es una contención segura hasta que ese diseño exista.

## 1. Principio rector

> El cliente puede decidir qué mostrar, pero nunca puede conceder permisos.

Ninguno de estos elementos es prueba válida de autorización: `localStorage`, `sessionStorage`, query parameters, hash de URL, cookies no firmadas, estado React, props de cliente, un selector visual, una variable global, o un header enviado por el navegador. La única fuente válida de autorización es la sesión server-side, verificada por `getCurrentUser()`/`requireAuth()`/`requireOperator()`/`requireAdmin()` (`src/services/authService.ts`, `src/lib/security/apiGuards.ts`).

## 2. Matriz de roles

| Rol | ¿Existe en sesión real? | ¿Existe solo en frontend? | Módulos que habilita (con respaldo real) | Riesgo antes del fix |
|---|---|---|---|---|
| `PUBLIC` | Sí (ausencia de sesión) | No | Módulos `visibility:"public"` (AURA, HERMES, ARCA, VIGIA, TALOS, VESTA) | Ninguno |
| `CITIZEN` | Sí | No | Igual que PUBLIC + entrada básica a `authenticated` | Ninguno |
| `VERIFIED_CITIZEN` | Sí (email verificado o cédula presente) | No | Igual que CITIZEN | Ninguno |
| `ANALYST` | Sí | No | ORÁCULO, FÉNIX, ATLAS (`allowedRoles` los incluye) | Ninguno |
| `OPERATOR` | Sí | No | NEXUS (`allowedRoles` lo incluye explícitamente), ORÁCULO | Ninguno |
| `ADMIN` | Sí | No | Todos (override de administrador en `canAccessModule`) | Ninguno |
| `POLICE` | **No** | Sí (solo vía selector demo) | CUSTOS (`accessType:"police_only"`) | **Alto** — alcanzable vía `ModulePlaceholderPage` antes del fix |
| `AUTHORITY` | **No** | Sí | CUSTOS | **Alto** — igual que POLICE |
| `INSTITUTIONAL_ADMIN` | **No** | Sí | NEXUS, FÉNIX, ATLAS (parcialmente, junto a roles reales) | Medio — solo explotable en módulos que usaran `ModulePlaceholderPage` (hoy: NEXUS) |
| `MEDICAL_OPERATOR` | **No** | Sí | Ninguno realmente gateado (AURA es `visibility:"public"`, no distingue este rol) | Bajo — el rol nunca actúa como gate efectivo hoy |
| `LOGISTICS` | **No** | Sí | NEXUS | Medio — mismo mecanismo que INSTITUTIONAL_ADMIN |
| `TRUSTED_CITIZEN` | **No** | Sí | Ninguno gateado por este rol en ningún módulo revisado | Bajo |
| `SUPER_ADMIN` | No (no producible desde `mapSessionUserToArgusRole`, ver nota) | Sí | Todos (mismo override que ADMIN) | Bajo — no hay camino de sesión real que lo produzca; queda como techo teórico del enum |

**Nota**: `mapSessionUserToArgusRole()` (`src/lib/modules/moduleAccess.ts`) solo puede devolver `PUBLIC`, `CITIZEN`, `VERIFIED_CITIZEN`, `ANALYST`, `OPERATOR` o `ADMIN` a partir de una sesión real — es una traducción explícita y exhaustiva del `UserRole` de Prisma (`String` libre, valores reales usados: `CITIZEN`, `OPERATOR`, `RESPONDER`, `ANALYST`, `ADMIN`). Ningún camino de código produce `POLICE`/`AUTHORITY`/`INSTITUTIONAL_ADMIN`/`MEDICAL_OPERATOR`/`LOGISTICS`/`TRUSTED_CITIZEN`/`SUPER_ADMIN` desde una sesión verificada hoy.

## 3. Overrides encontrados (inventario exhaustivo)

Búsqueda exhaustiva de `localStorage` en `src/modules`, `src/components/modules`, `src/app/modules`, `src/hooks` — solo dos archivos leían/escribían la clave de rol demo:

| Archivo | Uso | ¿Afectaba una decisión de acceso REAL? |
|---|---|---|
| `src/components/modules/ModulesMenu.tsx` | Lee/escribe `DEMO_ROLE_STORAGE_KEY` (`"argus-demo-module-role"`); antes: `effectiveRole = override \|\| sessionRole` pasado a `canAccessModule` para decidir qué tarjetas mostrar como "Entrar" | Indirectamente — decidía si el menú mostraba el botón "Entrar" o "Acceso restringido", pero no protegía el destino en sí |
| `src/components/modules/ModulePlaceholderPage.tsx` | Lee la misma clave; antes: `effectiveRole = demoRole ?? mapSessionUserToArgusRole(user)` — **este SÍ era el gate real** de cualquier módulo que usara esta página compartida | **Sí — bypass de autorización real**, hoy usado por NEXUS |

**Módulos NO afectados por el bypass** (verificado leyendo su código): CUSTOS (`custosAccess.ts` → `resolveCustosRole(user)` resuelve solo desde sesión), ATLAS (`atlasAccess.ts` → `resolveAtlasRole(user)`, ídem), FÉNIX institucional (`fenixAccess.ts` → `resolveFenixRole(user)`, ídem), ORÁCULO (sin lectura de `localStorage` en absoluto). Estos tres módulos ya resolvían su rol exclusivamente desde `useSession()` antes de esta tarea — el hallazgo original de la auditoría sobre "roles institucionales sin respaldo de servidor" se manifestaba realmente en el **menú** (presentación) y en **NEXUS** (único consumidor de `ModulePlaceholderPage`), no en los dashboards dedicados de CUSTOS/ATLAS/FÉNIX.

No se encontró ningún uso de query parameters, hash de URL, ni cookies no firmadas para determinar rol institucional en ningún módulo.

## 4. Política de producción

- `isDemoRoleOverrideAllowed()` (`src/lib/modules/moduleAccess.ts`): fail-closed. `NODE_ENV==="production"` → siempre `false`, sin excepción, independientemente del valor de cualquier variable. Fuera de producción, requiere `NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES==="true"` exacto (cualquier otro valor — `"1"`, `"yes"`, `"TRUE"`, `"on"` — se trata como `false`).
- `resolveEffectiveModuleRole(sessionRole, demoRole)`: único punto donde un valor de rol "candidato" (de cualquier origen: `localStorage`, futuro query param, etc.) puede sustituir al rol de sesión — y solo lo hace si `isDemoRoleOverrideAllowed()` es verdadero. En producción, siempre retorna `sessionRole`.
- `clearDemoRoleOverride()`: invocado por `ModulesMenu` y por `ModulePlaceholderPage` (independientemente entre sí, ya que un usuario puede aterrizar directo en una ruta de módulo sin pasar por el menú) cada vez que el override no está permitido — borra la clave de `localStorage` para que un valor de una sesión anterior, de una preview de Vercel, o de un entorno de desarrollo, nunca sobreviva hacia producción.
- El selector de rol de prueba en `/modules` permanece visible (no se rediseñó el menú) pero queda `disabled` cuando el override no está permitido, y no persiste ningún valor a `localStorage` en ese caso.

## 5. Módulos institucionales — equivalencias y bloqueos

| Módulo | Caso | Resolución |
|---|---|---|
| ATLAS | A — equivalencia legítima | `allowedRoles` incluye `ANALYST`/`ADMIN`/`SUPER_ADMIN` (reales); `INSTITUTIONAL_ADMIN` queda como techo aspiracional sin camino real, sin necesidad de bloqueo adicional porque el módulo ya resuelve por sesión |
| FÉNIX (institucional, `/modules/fenix`) | A — equivalencia legítima | Igual patrón que ATLAS: `ANALYST`/`OPERATOR`/`ADMIN` reales ya funcionan; `INSTITUTIONAL_ADMIN` es aspiracional |
| CUSTOS | Mixto — A para `ADMIN`, B para `POLICE`/`AUTHORITY` | `ADMIN` ya tiene acceso legítimo (override de administrador). `POLICE`/`AUTHORITY` no tienen ningún camino de sesión real — hoy son, en la práctica, inalcanzables (el módulo ya lo hacía bien antes de esta tarea). Se documenta aquí explícitamente como **Caso B**: permanecen sin acceso real hasta que exista RBAC institucional; no se creó ningún atajo ni equivalencia con `ADMIN` |
| NEXUS | Mixto — A para `OPERATOR`, B para `LOGISTICS`/`INSTITUTIONAL_ADMIN` | `OPERATOR` está legítimamente en `allowedRoles` y sigue funcionando. `LOGISTICS`/`INSTITUTIONAL_ADMIN` eran alcanzables únicamente vía el bypass de `ModulePlaceholderPage`, ahora cerrado — quedan como **Caso B**, sin acceso real hasta que existan esos roles en la sesión |

**No se convirtió `ADMIN` en `POLICE` ni se concedió ningún permiso institucional por analogía** — donde el rol real no existe, el acceso queda denegado, punto.

## 6. Prohibición de autorización desde el cliente

Confirmado por revisión de código: `canAccessModule()`, `mapSessionUserToArgusRole()`, `resolveEffectiveModuleRole()` y `getVisibleModules()` son funciones puras que reciben el rol como parámetro explícito — ninguna lee `localStorage`, `document.cookie`, `URLSearchParams`, ni ningún estado del navegador directamente. La única superficie que sí leía almacenamiento del navegador (`ModulesMenu.tsx`, `ModulePlaceholderPage.tsx`) ahora enruta ese valor a través de `resolveEffectiveModuleRole`, que lo descarta salvo en desarrollo explícitamente habilitado.

Los endpoints reales consumidos por ATLAS (`GET /api/users`, `GET /api/audit/logs`, `POST /api/sanctions`, `PATCH /api/reports|/api/help-requests`) ya exigen `requireOperator()`/`requireAdmin()` server-side, verificado en esta tarea — no dependen del rol calculado en cliente para nada más que decidir si mostrar un botón. CUSTOS y FÉNIX (`/modules/fenix`) no tienen endpoints propios (su búsqueda/datos son enteramente client-side sobre datos de demostración, per la auditoría previa) — no hay superficie de API adicional que cerrar para estos dos módulos en esta tarea.

## 7. Pasos futuros para RBAC institucional real

1. Definir en el modelo de usuario real (Prisma `User.role`, hoy `String` libre) los valores institucionales reales (`POLICE`, `AUTHORITY`, `INSTITUTIONAL_ADMIN`, `MEDICAL_OPERATOR`, `LOGISTICS`) y un proceso de asignación/verificación fuera de banda (no autoservicio).
2. Extender `mapSessionUserToArgusRole()` para traducir esos valores reales una vez existan — es, por diseño, el único punto que hay que tocar.
3. Añadir persistencia real de auditoría para CUSTOS (hoy `console.info` en desarrollo únicamente, ver `docs/audit/ARGUS_MASTER_BACKLOG.md` P2) antes de habilitar cualquier acceso policial real.
4. Decidir si NEXUS pasa a ser un módulo real o permanece como placeholder — hoy su `allowedRoles` mezcla un rol real (`OPERATOR`) con dos aspiracionales (`LOGISTICS`, `INSTITUTIONAL_ADMIN`), lo cual es aceptable mientras el módulo no tenga funcionalidad real detrás.
5. Revisar si `ModulePlaceholderPage` seguirá siendo el patrón compartido una vez NEXUS (u otro módulo) tenga funcionalidad real, o si necesitará su propio dashboard como CUSTOS/ATLAS/FÉNIX.

Este documento describe una contención, no una solución definitiva — no se declara aquí ningún RBAC institucional completo.
