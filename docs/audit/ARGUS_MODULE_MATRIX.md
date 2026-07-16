# ARGUS — Matriz de Módulos

> Auditoría de solo lectura. Fuente de verdad del registro de módulos: `src/data/argusModules.ts:13-471` (11 módulos — incluye VESTA con `menuOrder:11`, no listado en los 10 módulos originales del mandato). Gate de acceso central: `src/lib/modules/moduleAccess.ts`. Verificado el 2026-07-13.

## 0. Hallazgos transversales previos (afectan a todos los módulos)

1. **RBAC institucional sin respaldo real de servidor.** `mapSessionUserToArgusRole` (`moduleAccess.ts:25-47`) solo puede producir `PUBLIC/CITIZEN/VERIFIED_CITIZEN/ANALYST/OPERATOR/ADMIN` desde una sesión real, porque `User.role` en `prisma/schema.prisma:32` es un `String` libre, no un enum institucional. Roles como `POLICE, AUTHORITY, INSTITUTIONAL_ADMIN, MEDICAL_OPERATOR, LOGISTICS, TRUSTED_CITIZEN` **solo existen** vía un selector de rol de demostración en `localStorage` (`ModulesMenu.tsx:33-53`), sin verificación de servidor. Esto vacía de contenido la "restricción de acceso" de CUSTOS, NEXUS, FÉNIX institucional y partes de ATLAS.
2. **Dos ecosistemas de "evento" paralelos.** `CrisisEvent` vía `/api/events` (solo `Report`+`HelpRequest`) alimenta los 6 módulos verticales con datos reales; `ArgusEvent` vía `/api/argus/events` (SENAPRED en vivo + fuentes OSINT del motor Global Watch) alimenta el mapa operativo. **Ningún módulo vertical usa `ArgusEvent`.**

## 1. Ficha por módulo

### ATLAS
- **Propósito**: centro de mando institucional.
- **Ubicación**: `src/app/modules/atlas/page.tsx` → `AtlasDashboard.tsx`.
- **Datos reales**: `fetch("/api/events")`, `/api/users` (gateado por rol real OPERATOR/ADMIN), `/api/audit/logs` (modelo real `AuditLog`), `POST /api/sanctions`, `PATCH /api/reports|/api/help-requests`. Embebe el mapa real (`OperationalMap`).
- **Fallback demo**: solo si 0 eventos reales, marcado explícitamente.
- **Usuario objetivo**: institucional/analista en el registro, pero la sesión real solo llega vía OPERATOR/ADMIN.
- **Completitud**: ~65%. **Estado**: parcialmente confirmado / operativo.
- **Brecha crítica**: visibilidad institucional anunciada no calza con los roles reales de sesión disponibles.

### VIGIA
- **Propósito**: reportes ciudadanos.
- **Ubicación**: `src/modules/vigia/components/VigiaDashboard.tsx`.
- **Datos reales**: `fetch("/api/events")`, `POST /api/reports`. Embebe `OperationalMap` real vía `VigiaMapBridge.tsx`.
- **Hallazgo de nomenclatura**: existe un segundo sistema, también llamado "VIGIA" pero de código totalmente independiente, en `src/lib/vigia/globalWatchEngine.ts` — el motor de ingesta OSINT real y maduro (USGS, GDACS, EONET, FIRMS, ReliefWeb, EFFIS, Copernicus EMS, SENAPRED), expuesto en `/api/vigia/run|events|source-health`. Sin relación de código con el módulo-pantalla "VIGIA".
- **Completitud**: ~55% (módulo-pantalla) / ~80% (motor Global Watch homónimo, desconectado del módulo visible en el menú).
- **Estado**: parcialmente confirmado.

### ORÁCULO
- **Propósito**: fusión/confiabilidad de evidencia.
- **Ubicación**: `OraculoDashboard.tsx`. `fetch("/api/events")`, fallback demo si 0.
- **Backend dedicado**: ninguno (`/api/oraculo/*` no existe).
- **Datos**: scoring de confiabilidad, contradicciones y trazabilidad son heurísticas 100% cliente sobre los mismos Reports/HelpRequests — la fusión OSINT multi-fuente anunciada ya existe, pero en el motor Global Watch de VIGIA, no aquí.
- **Completitud**: ~40%. **Estado**: módulo visual con datos parcialmente reales; capacidad central anunciada no implementada en este módulo.

### TALOS
- **Propósito**: scoring de riesgo/impacto.
- **Ubicación**: `TalosDashboard.tsx`. `fetch("/api/events")`, fallback si 0.
- **Datos**: el scoring (`talosScoring.ts`) es una regla determinística real, no aleatoria. Puente activo y realmente invocado hacia FÉNIX (`prepareTalosSignalsForFenix`) y reutilizado server-side en `POST /api/vesta/profile` (`inferNearbyRiskContexts`).
- **Completitud**: ~48%. **Estado**: parcialmente confirmado — lógica real, pero alimentada solo por Report/HelpRequest, no por riesgo multi-hazard real.

### HERMES
- **Propósito**: enrutamiento seguro.
- **Ubicación**: `HermesDashboard.tsx`. `fetch("/api/events")`, fallback si 0.
- **Datos**: zonas de riesgo usan `talosDemoAssessments` **de forma incondicional**, ignorando datos reales de TALOS aunque existan. Routing (`hermesRouting.ts`) autodocumentado como simulado: "no implementa un motor de routing propio... genera geometría simulada". Mapa: panel compacto propio, explícitamente "no duplica OperationalMap" — no es el mapa real.
- **Completitud**: ~35%. **Estado**: módulo visual/simulado.

### ARCA
- **Propósito**: refugios y logística de evacuación.
- **Ubicación**: `ArcaDashboard.tsx`. `fetch("/api/events")` solo para contar señales VIGÍA secundarias.
- **Datos**: los refugios son **100% demo, incondicional** (`const shelters = arcaDemoShelters; const isDemoData = true`), autodocumentado: "ARCA todavía no tiene backend real de refugios". Ruteo delega en el routing simulado de HERMES. Mapa: panel compacto, no `OperationalMap` real.
- **Completitud**: ~28%. **Estado**: módulo visual (datos siempre simulados), autodocumentado como tal.

### NEXUS
- **Propósito**: coordinación logística/interinstitucional.
- **Ubicación**: no existe `src/modules/nexus/`. `src/app/modules/nexus/page.tsx` renderiza únicamente `ModulePlaceholderPage`.
- **Backend**: ninguno (`/api/nexus` no existe). Cuatro archivos "bridge" (`hermesNexusBridge.ts`, `arcaNexusBridge.ts`, `auraNexusBridge.ts`, `fenixNexusBridge.ts`) autodocumentados como "NEXUS todavía no existe como módulo completo" — ninguna de sus funciones es importada desde ningún otro archivo del repo.
- **Completitud**: ~2%. **Estado**: el único módulo puramente conceptual (tarjeta de menú, sin pantalla real).

### AURA
- **Propósito**: contexto médico/salud pública.
- **Ubicación**: `AuraDashboard.tsx` — **cero `fetch()`**, todo desde arrays demo.
- **Datos**: reutiliza `AuraMedicalRoutePanel` (real como componente) pero sin fetch propio, dependiente del routing simulado de HERMES. Existe además `src/lib/aura/*` (14 adaptadores reales: ECDC, GDELT, GVP, HDX, IOC, NOAA, OpenAQ, OSM, USGS, WHO) que **no se referencia desde el módulo AURA** — parece consumido por FÉNIX, no por AURA.
- **Completitud**: ~28%. **Estado**: módulo visual con motor de contexto real pero desconectado del propio módulo.

### FÉNIX
- **Propósito**: gemelo digital predictivo institucional.
- **Hallazgo P0 — duplicación completa**: `src/app/modules/fenix/page.tsx` → `FenixDashboard.tsx` es 100% cliente sobre escenarios demo, cero `fetch()`. En paralelo existe un sistema FÉNIX distinto y más maduro en `src/app/dashboard/fenix/page.tsx` → `FenixTwinPanel.tsx`, respaldado por `POST /api/fenix/simulation`, que sí verifica rol institucional real y ejecuta `runFenixSimulation` con 18 adaptadores de fuentes reales.
- **Completitud**: `/modules/fenix` ~22%; FÉNIX Twin legado (`/dashboard/fenix`) ~65% pero **inalcanzable desde el menú de módulos**.
- **Estado**: duplicado — el menú dirige al usuario a la versión débil.

### CUSTOS
- **Propósito**: búsqueda/auditoría restringida policial.
- **Ubicación**: `CustosDashboard.tsx`, gate teórico policial/autoridad.
- **Datos**: la búsqueda **siempre retorna resultados demo** sin importar la query (`custosSearch.ts`); no existe `/api/custos`. Auditoría (`custosAudit.ts`) es solo `console.info` fuera de producción — **no persiste** en `AuditLog` pese a prometerlo en el roadmap y pese a `requiresAudit:true`.
- **Completitud**: ~18%. **Estado**: simulado / riesgo no comprobado — módulo marcado como sensible/auditado que en realidad no busca ni audita nada real, y cuyo "acceso restringido" depende de un rol solo alcanzable por selector de demo.

### VESTA (11º módulo — no listado en el mandato original; discrepancia confirmada)
- **Propósito**: preparación familiar/personal ante emergencias.
- **Presente en el registro** (`argusModules.ts:423-470`, `menuOrder:11`) como módulo de pleno derecho, pese a no formar parte de los 10 módulos nombrados.
- **Datos reales**: CRUD real contra `/api/vesta/profile|checklist|contacts|family-plan|reminders`, todas con `getCurrentUser()` real, Prisma real (`PreparednessProfile`, `FamilyPlan`, `EmergencyContact`, etc.), y **auditoría persistida de verdad** vía `logAuditEvent` — a diferencia de CUSTOS/ATLAS. Puente server-side real a TALOS.
- **Completitud**: ~75%. **Estado**: operativo / cerca de producción — el módulo más maduro de los 11, pese a no estar en la lista oficial de 10.

## 2. Tabla resumen

| Módulo | Estado | % completitud | Usuario objetivo | ¿ArgusEvent? | ¿Mapa real? | ¿Notificaciones? | Duplicaciones |
|---|---|---|---|---|---|---|---|
| ATLAS | Parcialmente confirmado/operativo | 65% | Institucional/Analista (real: OPERATOR/ADMIN) | No | Sí | No | — |
| VIGIA | Parcialmente confirmado | 55% / 80% (motor) | Público | No | Sí | No | Nombre compartido con motor OSINT independiente |
| ORÁCULO | Módulo visual | 40% | Analista | No | No | No | Solapa con Global Watch sin reutilizarlo |
| TALOS | Parcialmente confirmado | 48% | Público/Analista | No | No | No | — |
| HERMES | Módulo visual/simulado | 35% | Público | No | Parcial | No | Routing simulado reutilizado por ARCA/AURA |
| ARCA | Módulo visual (simulado) | 28% | Público | No | Parcial | No | Depende del routing simulado de HERMES |
| NEXUS | Módulo conceptual | 2% | Institucional/Logística | No | No | No | 4 bridges muertos |
| AURA | Módulo visual | 28% | Público | No | No | No | `src/lib/aura` real no conectado al módulo |
| FÉNIX | **Duplicado** | 22% / 65% (legado) | Institucional | No | No | No | Reimplementación completa de sistema previo más real |
| CUSTOS | Simulado/riesgo no comprobado | 18% | Policía/Autoridad (inalcanzable real) | No | No | No | — |
| VESTA (no en mandato) | Operativo | 75% | Público | No | No | No | 11º módulo no listado, más maduro que 8 de los 10 oficiales |

## 3. Top 5 hallazgos transversales

1. **P0 — FÉNIX duplicado y regresivo.** El menú dirige a la versión 100% simulada; el sistema real con RBAC y 18 fuentes externas queda huérfano en `/dashboard/fenix`. Recomendación: enlazar `/modules/fenix` al motor real o retirar el menú nuevo hasta integrarlo.
2. **P0 — RBAC de módulos sensibles sin respaldo de servidor.** CUSTOS/NEXUS/FÉNIX institucional dependen de roles (`POLICE/AUTHORITY/...`) que solo existen vía selector de demo en `localStorage`. Recomendación: no exponer roles institucionales en el gate hasta que existan en el modelo real de usuario.
3. **P1 — Ningún módulo vertical usa el pipeline real `ArgusEvent`.** Los 6 módulos con datos reales (ATLAS/VIGIA/ORÁCULO/TALOS/HERMES/ARCA) solo ven `Report`+`HelpRequest`, nunca incidentes de fuentes externas (SENAPRED, USGS, GDACS, FIRMS, etc.). Recomendación: unificar sobre `ArgusEvent` o documentar explícitamente la separación.
4. **P2 — CUSTOS no persiste auditoría pese a ser el módulo más sensible.** Contradice `requiresAudit:true`. Recomendación: bloquear en producción hasta persistir auditoría real.
5. **P3 — Cadena de simulación en cascada VIGIA→TALOS→HERMES→ARCA/AURA.** Ningún dato de refugio/ruta es real en ninguno de los tres módulos dependientes de HERMES. Recomendación: tratarlos como un solo bloque de riesgo al evaluar "listo para producción", no como módulos independientes.
