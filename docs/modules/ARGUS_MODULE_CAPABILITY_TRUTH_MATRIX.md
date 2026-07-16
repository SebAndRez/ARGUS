# ARGUS — Matriz de verdad de capacidades (HERMES, ARCA, AURA, CUSTOS, NEXUS)

> Prompt 18 §35. Cada fila es una capacidad que la interfaz de alguno de estos 5 módulos muestra o sugiere hoy. "Evidencia" cita archivo:línea o el nombre de la constante/función que respalda (o contradice) la afirmación.

## HERMES

| Capacidad | UI | Backend | Persistencia | Estado | Evidencia |
|---|---|---|---|---|---|
| Bloqueos de vía desde reportes ciudadanos | Sí | Real (Prisma vía `/api/events`) | Sí (tabla `Report`/`HelpRequest`) | Real cuando hay reportes | `HermesDashboard.tsx` `loadReports()` |
| Bloqueos de vía cuando no hay reportes | Sí | Fixture estático | No | Demo, declarado (`isDemoData`) | `src/modules/hermes/data.ts` `hermesDemoBlockages` |
| Zonas de riesgo TALOS | Sí | Fixture estático | No | Siempre demo | `talosDemoAssessments` vía `hermesTalosBridge.ts` |
| Geometría/distancia/duración de ruta | Sí | Motor mock (`getMockRoutes`) | No | Siempre demo, `isDemo: true` forzado | `hermesRouting.ts:156` |
| Puntaje de ruta / seguridad / explicación | Sí | Lógica determinística real | No | Real (sobre geometría demo) | `hermesRouteScoring.ts`, `hermesRouteSafety.ts`, `hermesExplanations.ts` |
| Envío de resumen a ATLAS | Botón visible | No implementado | No | Preview (stub) | `HermesDashboard.tsx` `handleSendToAtlas` — "preparado, no implementado aún" |
| Auditoría de acciones | Sí | Solo consola fuera de producción | No | Placeholder | `hermesAudit.ts` |

## ARCA

| Capacidad | UI | Backend | Persistencia | Estado | Evidencia |
|---|---|---|---|---|---|
| Listado de refugios | Sí | Fixture estático, sin excepción | No | Siempre demo | `ArcaDashboard.tsx:68-69` `isDemoData = true` (literal) |
| Capacidad/ocupación por refugio | Sí | Números fijos en el fixture | No | Siempre demo, marcado `isEstimated: true` | `src/modules/arca/data.ts` |
| Señales VIGÍA relacionadas con refugios | Contador informativo | Real (Prisma vía `/api/events`) | Sí (origen) | Real, pero no actualiza capacidad ni disponibilidad | `ArcaDashboard.tsx` `loadVigiaSignals()` |
| Ruta sugerida a un refugio | Sí | Motor HERMES (siempre demo) | No | Demo | `handlePlanRoute` → `calculateHermesRoutes` |
| Permiso para pedir ruta (`canPlanRoute`) | Botón visible condicionalmente | Real, gateado por `send_to_hermes` | N/A | **Corregido en esta tarea** (antes: literal `true`) | `arcaAccess.ts` `canUseArcaFeature` |
| Necesidades críticas por refugio | Sí | Sobre datos demo | No | Demo | `ArcaNeedsPanel` sobre `arcaDemoShelters` |
| Auditoría de acciones | Sí | Solo consola fuera de producción | No | Placeholder | `arcaAudit.ts` |

## AURA

| Capacidad | UI | Backend | Persistencia | Estado | Evidencia |
|---|---|---|---|---|---|
| Ubicación del usuario | Sí | Real (`navigator.geolocation`) | No (solo estado local) | Real | `useUserLocation.ts`, `useLiveMedicalRoute.ts` |
| Ruta por calles reales al punto médico | Sí | Real (proveedor de ruteo multi-fuente) | No | Real, con fallback en línea recta declarado | `src/lib/routing/routingService.ts` |
| Puntos médicos (nombre, ubicación, servicios) | Sí | Fixture estático (8 puntos) | No | Siempre demo | `src/modules/aura/data.ts` `auraDemoMedicalPoints` |
| Camas/ambulancias/personal disponibles | Sí | Números fijos en el fixture | No | Demo, marcado `isEstimated: true` (ahora visible por ítem) | `data.ts` `capacity.isEstimated`; render en `AuraDashboard.tsx` |
| "Ruta más segura" (evita zonas de riesgo) | Botón visible | Motor HERMES real, pero sin datos de riesgo desde el dashboard | No | Código real, uso actual inerte | `auraMedicalRouting.ts` `buildAuraSafeRoute`; `AuraDashboard.tsx` no pasa `riskProjections`/`conflictZones` |
| Perfil médico opcional | Sí | Ninguno (solo estado de React) | No | Real por diseño (nada que filtrar) | `AuraMedicalPanel.tsx` |
| Redacción de perfil por rol | Sí | Lógica real | N/A | Real | `auraPrivacy.ts` `sanitizeAuraMedicalProfileForRole` |
| Casos de triaje / stock médico | Sí (rol profesional) | Fixture estático | No | Siempre demo | `auraDemoTriageCases`, `auraDemoStock` |
| Fuente real de hospitales/clínicas (`CriticalPoi`, OSM) | No conectada a la UI | Real (Prisma + adaptador OSM) | Sí | Existe pero dormida — candidato de mejora, no bug | `src/lib/criticalPoi/criticalPoiModuleQueries.ts`, `src/lib/aura/osmMedicalContext.ts` |

## CUSTOS

| Capacidad | UI | Backend | Persistencia | Estado | Evidencia |
|---|---|---|---|---|---|
| Control de acceso (rol policial/autoridad) | Sí | Real | N/A | Real | `custosAccess.ts` `resolveCustosModuleAccess` |
| Motivo operacional obligatorio | Sí | Validación real | No | Real (validación), no persistida | `custosOperationalReason.ts` |
| Aviso legal previo a búsqueda | Sí | N/A | No | Real | `CustosDashboard.tsx` |
| Resultado de búsqueda | Sí | Fixture fijo (3 personas), ignora el criterio ingresado | No | Siempre demo | `custosSearch.ts` `performCustosSearch` → `custosDemoResults` |
| Redacción de resultado por nivel de acceso | Sí | Lógica real sobre datos demo | No | Real (sobre datos demo) | `custosPrivacy.ts` `redactCustosResultForAccessLevel` |
| Auditoría de consulta | Panel visible con historial | Solo consola fuera de producción | No, pese a `requiresAudit: true` | Placeholder | `custosAudit.ts`; `argusModules.ts` `futureIntegrations` promete persistencia futura |
| Detección de consultas sospechosas | Declarada en el registro | Función existe (`detectCustosSuspiciousQuery`) | N/A | Código muerto, sin llamador | `custosRiskFlags.ts` |
| Estado humanitario derivado | Declarado en integraciones preparadas | Función existe (`deriveCustosHumanitarianStatus`) | N/A | Código muerto, sin llamador | `custosHumanitarianStatus.ts` |

## NEXUS

| Capacidad | UI | Backend | Persistencia | Estado | Evidencia |
|---|---|---|---|---|---|
| Cualquier capacidad de inventario/logística | Solo texto de "capacidades previstas" | Ninguno | Ninguna | Planificado | `ModulePlaceholder.tsx` sobre metadata de `argusModules.ts`; no existe `src/modules/nexus/` |
| Puentes desde FÉNIX/AURA/ARCA/HERMES hacia NEXUS | No expuestos en ninguna UI | 4 funciones puras definidas, 0 importadores en todo el repo | No | Muerto | `fenixNexusBridge.ts`, `auraNexusBridge.ts`, `arcaNexusBridge.ts`, `hermesNexusBridge.ts`; verificado por test automatizado (`nexus-stabilization.test.ts`) |
