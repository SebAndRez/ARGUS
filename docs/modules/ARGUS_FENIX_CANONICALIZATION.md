# ARGUS — Canonicalización de FÉNIX

> Resuelve el hallazgo P0 de la auditoría (`docs/audit/ARGUS_MASTER_BACKLOG.md`, ítem P0.7): FÉNIX existía en dos implementaciones independientes, y el menú dirigía a la más débil. **Este documento no declara que FÉNIX está listo para producción** — declara que la duplicación quedó resuelta y el estado real, documentado.

## 1. Implementaciones encontradas

| Implementación | Ruta (antes) | Componente | Motor |
|---|---|---|---|
| A | `/modules/fenix` | `FenixDashboard.tsx` (`src/modules/fenix/components/`) | `runFenixScenario` (`fenixScenarioEngine.ts`) sobre `fenixDemoScenarios` estáticos |
| B | `/dashboard/fenix` | `FenixTwinPanel.tsx` (`src/components/fenix/`) | `runFenixSimulation` (`src/lib/fenix/fenixSimulationEngine.ts`) vía `POST /api/fenix/simulation` |

## 2. Matriz comparativa

| Criterio | `/modules/fenix` (A, antes) | `/dashboard/fenix` (B) |
|---|---|---|
| Componente principal | `FenixDashboard` | `FenixTwinPanel` |
| Datos reales | Ninguno | Parámetros geográficos reales del usuario (lat/lng, radio); contexto de asentamientos cercanos vía `fenixGeoContextEngine.ts` |
| Datos demo | 100% — `fenixDemoScenarios` (`src/modules/fenix/data.ts`), 3 escenarios fijos | Escenario base seleccionable (`demoFenixScenarios`) como punto de partida, pero el cálculo corre sobre el input real ingresado |
| Endpoints | Ninguno (cero `fetch()`) | `POST /api/fenix/simulation`, `POST /api/fenix/action-plan` |
| Persistencia | Ninguna | Ninguna (sin cambios en esta tarea — no se conecta a Prisma) |
| Fuentes | Ninguna real — solo texto estático mencionando TALOS/HERMES/ARCA/NEXUS/AURA/ORÁCULO/VIGÍA sin invocarlos | ~13 adaptadores reales en `src/lib/fenix/*FenixContext.ts` (USGS, NOAA×3, IOC, OpenAQ, HDX, OSM, Copernicus flood) vía `fenixDataFusion.ts`/`fenixSourceAttribution.ts` |
| RBAC | `resolveFenixModuleAccess` (`src/modules/fenix/fenixAccess.ts`) — ya usaba solo sesión real | Antes: chequeo propio duplicado en cada endpoint (`INSTITUTIONAL_ROLES` inline). Ahora: `requireOperator()` reutilizado |
| Mapa | Ninguno | Ninguno (el panel no embebe un mapa propio; usa `geoContext`/`nearbySettlements` en texto/tarjetas) |
| Simulación | Determinística sobre datos 100% fijos (mismos 3 escenarios siempre) | Determinística sobre input variable + contexto de fuentes reales; sigue sin ser una predicción validada operacionalmente |
| Estado real | **Demo / simulada** | **Parcialmente operativa** — motor de cálculo real y fuentes reales de contexto, pero sin persistencia, sin lifecycle, sin validación humana estructurada |
| Consumidores | Menú principal (`ModulesMenu.tsx` vía `argusModules.ts`), `ArgusModuleLauncher.tsx` (quick-launch, aunque este ya enlazaba a la versión B) | `ArgusModuleLauncher.tsx`/`FenixTwinModulePanel.tsx` (enlace directo), notificaciones (`notificationCenterEngine.ts` construye `/dashboard/fenix?lat=&lng=` para el botón "Abrir Fenix") |

## 3. Clasificación

- **`FenixDashboard` (A)**: **demo/simulada**. Cero fetch, cero fuentes reales, 3 escenarios fijos, texto que menciona integraciones (TALOS/HERMES/ARCA/NEXUS/AURA/ORÁCULO/VIGÍA) sin invocar ninguna.
- **`FenixTwinPanel` (B)**: **parcialmente operativa**. Motor de cálculo real (`runFenixSimulation`, síncrono, determinístico) sobre ~13 adaptadores de fuentes reales para *contexto* (asentamientos cercanos, calidad de aire, nivel del mar, etc.) — pero:
  - No persiste ningún resultado (cada simulación es efímera, se pierde al recargar).
  - No tiene lifecycle (no hay "cerrar", "confirmar", "archivar" una simulación).
  - Las "rutas afectadas", "refugios" y "puntos médicos" que muestra siguen siendo generados por lógica de simulación interna (`fenixRouteImpact.ts`-equivalentes dentro del motor), no por HERMES/ARCA/AURA reales — la mención de integración con esos módulos es, en la práctica, aspiracional en ambas versiones.
  - `result.isDemo` existe como campo en la respuesta del motor — confirmando que incluso la implementación "más madura" se autoclasifica parcialmente como demo en ciertas condiciones (revisar `fenixSimulationEngine.ts` si se requiere el detalle exacto de cuándo se marca `true`).

**No se infla el estado de B a "operativo".** Es la implementación con más respaldo técnico real, no una implementación terminada.

## 4. Decisión tomada

**Opción A** (renderizar el motor real dentro de `/modules/fenix`), tal como prefiere el mandato.

- **Ruta canónica**: `/modules/fenix`.
- **Componente oficial**: `FenixTwinPanel`, envuelto por el nuevo `FenixOfficialGate` (`src/modules/fenix/components/FenixOfficialGate.tsx`), que resuelve acceso exclusivamente desde la sesión real (`mapSessionUserToArgusRole` + `canAccessModule`, la misma política central de `src/lib/modules/moduleAccess.ts` usada por todos los demás módulos desde el Prompt 5 — **sin excepción ni atajo nuevo**).
- **Ruta legacy**: `/dashboard/fenix` → redirección server-side (`redirect()` de `next/navigation`) a `/modules/fenix`, preservando el query string (relevante para el enlace `?lat=&lng=` que construye `notificationCenterEngine.ts`, archivo que **no fue modificado** en esta tarea).
- **Sin bucle**: `/modules/fenix` no importa `redirect()` en absoluto ni referencia `/dashboard/fenix` — verificado por test automatizado leyendo el código fuente.

### Hallazgo adicional durante la implementación: `src/proxy.ts`

Este proyecto usa `src/proxy.ts` (no `middleware.ts` — ver advertencia de `AGENTS.md` sobre breaking changes de esta versión de Next.js). `/dashboard/*` está en `protectedPrefixes` (exige **alguna** sesión, sin distinguir rol) y `/modules/*` **no** lo está — el sistema de módulos siempre ha dependido del chequeo de rol más fino en el cliente (`canAccessModule`), no del proxy, precisamente para permitir que usuarios anónimos vean el "teaser" institucional sin ser expulsados a `/login`. Confirmado en vivo: un visitante anónimo en `/modules/fenix` ve "Acceso no disponible" (sin fuga de contenido), mientras que `/dashboard/fenix` lo redirige primero a `/login` (protección adicional pre-existente del proxy, ahora en cascada hacia la ruta canónica tras iniciar sesión). No se modificó `src/proxy.ts` en esta tarea.

## 5. Acceso

| Usuario | Resultado | ¿Se ejecuta simulación? |
|---|---|---|
| Sin sesión | `canEnter:false` → "Acceso no disponible" (verificado en vivo) | No |
| CITIZEN | `canEnter:false` (CITIZEN no está en `allowedRoles` de `argus-fenix`) | No |
| OPERATOR | `canEnter:true` (rol real, ya en `fenixAccess.ts`) | Sí — `/api/fenix/simulation` ahora exige `requireOperator()` (antes: aceptaba anónimos en modo "public") |
| ANALYST / ADMIN | `canEnter:true` | Sí |
| Rol demo (`localStorage`) | Sin efecto — `resolveEffectiveModuleRole` (Prompt 5) lo ignora fuera de desarrollo explícitamente habilitado | No |

## 6. Datos y fuentes

- **Reales**: parámetros de entrada del usuario (ubicación, radio, severidad declarada); contexto de asentamientos/fuentes ambientales vía los ~13 adaptadores en `src/lib/fenix/`.
- **Simulación**: todo el "curso de crisis" (zonas afectadas, crecimiento, rutas/refugios/puntos médicos impactados, plan de acción) es calculado por `runFenixSimulation`, una función determinística — no una predicción validada ni un incidente confirmado.
- **Pendiente**: persistencia de resultados, lifecycle, integración real con HERMES/ARCA/AURA/TALOS (hoy simulada internamente, no delegada a esos módulos).
- **No modificado**: `runFenixSimulation` (solo se simplificó una condición de autorización ya redundante tras el guard del endpoint — ningún algoritmo cambió), adaptadores de fuentes, Prisma, Global Watch, notificaciones, mapa general.

## 7. Código legacy

| Archivo | Estado | Motivo |
|---|---|---|
| `src/modules/fenix/components/FenixDashboard.tsx` | Desacoplado de navegación oficial, conservado | Sigue teniendo su propio gate de acceso correcto (no es un riesgo de seguridad) — se conserva por si se decide reutilizar su UI de "constructor de escenario" en el futuro |
| `src/modules/fenix/fenixScenarioEngine.ts`, `fenixConfidence.ts`, `fenixEvacuation.ts`, `fenixExposure.ts`, `fenixMedicalImpact.ts`, `fenixResourceDemand.ts`, `fenixRouteImpact.ts`, `fenixShelterDemand.ts` | Conservados | Solo consumidos por `FenixDashboard` (legacy); no eliminados sin evidencia de cero dependencias futuras |
| `src/modules/fenix/fenixAtlasBridge.ts` | Conservado, único bridge de `src/modules/fenix/*Bridge.ts` con un consumidor real (`FenixDashboard`) | — |
| `src/modules/fenix/fenixArcaBridge.ts`, `fenixAuraBridge.ts`, `fenixHermesBridge.ts`, `fenixNexusBridge.ts`, `fenixOraculoBridge.ts`, `fenixTalosBridge.ts`, `fenixVigiaBridge.ts` | **Candidatos a eliminación futura** — confirmado por búsqueda exhaustiva: cero imports desde ningún otro archivo | No implementan NEXUS ni se conectan en esta tarea, tal como exige el mandato |
| `src/modules/arca/arcaFenixBridge.ts`, `src/modules/aura/auraFenixBridge.ts`, `src/modules/hermes/hermesFenixBridge.ts`, `src/modules/vesta/vestaFenixBridge.ts` | **Candidatos a eliminación futura** | Cero consumidores confirmado |
| `src/modules/talos/talosModuleBridges.ts` (`prepareTalosSignalsForFenix`) | Conservado, parcialmente usado | Invocado por `TalosDashboard.tsx`, pero no consumido por ninguna de las dos implementaciones de FÉNIX — bridge unidireccional sin destino real todavía |
| `src/lib/predictive-core/fenixBridge.ts` (`createFenixSeedFromPrediction`) | **Activo, en uso real** | Consumido por `/api/fenix/simulation/route.ts` — parte de la implementación canónica |
| `src/components/modules/FenixTwinModulePanel.tsx` | Conservado, actualizado | Panel "teaser" del quick-launcher (`ArgusModuleLauncher.tsx`); sus dos enlaces se actualizaron de `/dashboard/fenix` a `/modules/fenix` |

Ningún archivo fue eliminado en esta tarea — no se demostró ausencia total de consumidores para `FenixDashboard` (su propio código sigue siendo válido y auto-gateado), y los bridges muertos, aunque confirmados sin consumidores, no se eliminan sin instrucción explícita adicional.

## 8. Riesgos pendientes

- **Madurez de FÉNIX**: la implementación canónica (`FenixTwinPanel`) sigue siendo una simulación sin persistencia ni lifecycle — no debe presentarse como un sistema de gestión de incidentes reales.
- **Simulación vs confirmación**: se agregaron badges/textos ("Predicción ARGUS", "Simulación / escenario proyectado") pero la separación estructural completa (tipo `dataMode` como se hizo para Command Center en el Prompt 6) no se extendió a FÉNIX en esta tarea — posible trabajo futuro de consistencia.
- **RBAC institucional**: `INSTITUTIONAL_ADMIN` sigue sin ningún camino de sesión real (ver `docs/security/ARGUS_MODULE_ACCESS_BASELINE.md`) — FÉNIX depende de `OPERATOR`/`ANALYST`/`ADMIN` reales, consistente con esa limitación ya documentada.
- **Código legacy**: 7 bridges de `src/modules/fenix/` + 4 bridges externos confirmados sin consumidores — candidatos a eliminación en una tarea futura dedicada, no en esta.
- **Futura entidad canónica**: si algún día FÉNIX persiste resultados, deberá decidirse si usa la futura entidad canónica de incidente (P0.5 del backlog) en vez de crear un séptimo modelo paralelo.
