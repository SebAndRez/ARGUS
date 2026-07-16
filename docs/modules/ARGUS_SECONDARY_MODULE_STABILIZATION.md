# ARGUS — Estabilización de módulos secundarios (HERMES, ARCA, AURA, CUSTOS, NEXUS)

> Prompt 18. Este documento no rediseña ningún módulo — declara, con evidencia de código, qué capacidad es real y cuál es demo/preview/planificada en cada uno, y documenta las correcciones aplicadas para que la interfaz deje de sugerir más de lo que el backend realmente respalda.

Dos premisas del mandato original resultaron incorrectas al verificarlas contra el código y se corrigieron antes de clasificar nada:

- **CUSTOS no es un módulo de seguridad/privacidad del dispositivo.** Es una herramienta institucional de búsqueda de personas (desaparecidos, estado humanitario) para roles policiales/autoridad, con motivo operacional obligatorio y auditoría.
- **NEXUS no es un coordinador de incidentes.** Su propósito declarado en el registro es logística (inventario, suministros, transporte, prioridades), y hoy no existe ningún código de módulo — solo la entrada de registro y 4 archivos puente sin usar.

## 1. Estado anterior

| Módulo | Estado declarado (antes) | Estado comprobado (código) | Problema principal |
|---|---|---|---|
| HERMES | `status: active`, sin eje de madurez | Ingesta de bloqueos real cuando hay datos; geometría de ruta siempre simulada | La UI no distinguía "bloqueos reales" de "ruta siempre demo" |
| ARCA | `status: active`, sin eje de madurez | Refugios 100% hardcodeados, sin excepción | `isDemoData` ya se declaraba, pero `canPlanRoute` estaba forzado a `true` sin pasar por el gate de permisos |
| AURA | `status: active`, sin eje de madurez | Ruteo/geolocalización real; dataset médico 100% hardcodeado | Capacidad de camas se mostraba sin marcar como estimada por ítem |
| CUSTOS | `status: restricted` | Acceso real y auditado; búsqueda 100% demo fija | Auditoría solo en consola pese a `requiresAudit: true`; 9 funciones/puentes muertos |
| NEXUS | `status: institutional` | Cero implementación; 4 puentes sin importador en todo el repo | Sin eje de madurez que distinga "institucional" (acceso) de "no implementado" (capacidad) |

## 2. Estado final

| Módulo | Clasificación final (`maturity`) | Capacidades reales | Capacidades no disponibles |
|---|---|---|---|
| **HERMES** | `partially_operational` | Bloqueos desde `/api/events` (Prisma) cuando existen reportes reales; scoring/seguridad/explicación determinísticos (sin `Math.random`) | Geometría de ruta siempre simulada (`isDemo: true` forzado); zonas de riesgo siempre demo de TALOS; sin persistencia |
| **ARCA** | `preview` | Contador de señales VIGÍA real (informativo); scoring de capacidad/idoneidad determinístico sobre datos demo | Refugios 100% fijos (`arcaDemoShelters`), sin `/api/arca/*`; ruteo delega en HERMES (también demo) |
| **AURA** | `partially_operational` | Geolocalización real; ruteo por calles real (multi-proveedor) con fallback en línea recta declarado; privacidad y redacción por rol reales, nada se persiste | Puntos médicos/capacidad/triage/stock 100% fijos; "ruta más segura" reutiliza HERMES real pero no recibe datos de riesgo del dashboard, por lo que en la práctica es inerte |
| **CUSTOS** | `preview` (acceso ya es `restricted` vía `visibility`/`accessType`) | Gate de rol + motivo operacional + aviso legal real, aplicado antes de cualquier resultado; auditoría se dispara en cada intento | `performCustosSearch` siempre devuelve el mismo set de 3 personas demo, sin importar el criterio; auditoría solo en consola, no persistida |
| **NEXUS** | `planned` | Registro + placeholder genérico correctos | Ningún código de módulo; 4 puentes (`*NexusBridge.ts`) sin ningún importador |

## 3. Registro y navegación

- Fuente de verdad: `src/data/argusModules.ts` (`ArgusModuleDefinition`, `src/types/argusModule.ts`).
- Se agregó un eje **independiente** de madurez (`maturity` + `maturityNotes`), que no reemplaza `status`/`visibility`/`accessType` (eso sigue describiendo *acceso*). `maturity` describe *cuánto de lo mostrado es real*. Es opcional: solo se pobló para los 5 módulos auditados en esta tarea — los otros 6 (ATLAS, FÉNIX, VIGÍA, ORÁCULO, TALOS, VESTA) quedan sin este campo porque no fueron auditados aquí, para no inventarles una clasificación.
- Etiqueta visual compartida (`ModuleMaturityBadge`, `src/components/modules/ModuleMaturityBadge.tsx`): `OPERATIVO / PARCIAL / RESTRINGIDO / VISTA PREVIA / PLANIFICADO / NO DISPONIBLE`, reutilizada por `ModulePlaceholder.tsx` (NEXUS) y los 4 dashboards con contenido propio (antes cada uno tenía su propio texto ad hoc de "Modo demo").
- No se crearon rutas nuevas ni se tocaron rutas de ATLAS/VIGÍA/ORÁCULO/TALOS/FÉNIX. Las 5 rutas canónicas (`/modules/hermes`, `/modules/arca`, `/modules/aura`, `/modules/custos`, `/modules/nexus`) no cambiaron.
- El gate de acceso en las 5 rutas sigue siendo client-side (`useSession()` + `resolveXModuleAccess`), igual que en el resto de los módulos de la aplicación — no es una regresión introducida aquí, es el patrón preexistente en todo `argus-grid`. Se documenta como riesgo pendiente (sección 8), no se rediseñó, porque hacerlo habría significado tocar el mecanismo de sesión/proxy de toda la app, fuera del alcance de este prompt.

## 4. Integración canónica (Prompt 17)

Ninguno de los 5 módulos consume `canonicalIncidentGateway.ts` / `moduleOperationalContext.ts` ni referencia `canonicalIncidentId`. No se forzó la integración: HERMES/ARCA/AURA/CUSTOS/NEXUS no actúan hoy sobre un `KnowledgeIncident` — HERMES/ARCA leen `Report`/`HelpRequest` vía `/api/events`, AURA no consume ningún incidente, CUSTOS/NEXUS no tienen función alguna que dependa de un incidente. Agregar esa integración habría sido una funcionalidad nueva, fuera del alcance ("no crear nuevas funcionalidades de producto"). Si en el futuro alguno de estos módulos gana una función que sí actúe sobre un incidente (p. ej. "evitar zona del incidente X" en HERMES), esa función deberá reutilizar el gateway del Prompt 17, no reinventar un `canonicalIncidentId` propio.

## 5. Datos demo

**Corregido en esta tarea (mismatch entre la interfaz y el backend):**
- ARCA: `ArcaDashboard.tsx` pasaba `canPlanRoute` como literal `true` a `ArcaShelterList`, sin pasar por `canUseArcaFeature(user, "send_to_hermes")` — cualquier rol veía el botón de rutear a un refugio, sin que el permiso ya definido en `arcaAccess.ts` se aplicara. `ArcaNearbySheltersPanel` tenía el mismo problema pero más grave: ni siquiera aceptaba un prop de permiso, así que el botón "Sugerir ruta con HERMES" se mostraba siempre a cualquier visitante. Ambos ahora reciben `canPlanRoute={canUseArcaFeature(sessionUser, "send_to_hermes")}`.
- AURA: la capacidad estimada por punto médico (`AuraMedicalPoint.capacity.isEstimated`, ya existente en el dato) no se mostraba en la tarjeta del punto — ahora aparece "(estimada, no confirmada)" junto al estado de capacidad.
- HERMES: cada ruta ya se marcaba `isDemo: true` internamente, pero solo el banner superior lo comunicaba — ahora `HermesRouteCard` también muestra una etiqueta "Simulada" por ruta individual.
- HERMES: `hermesDemoBlockages` (4 bloqueos 100% inventados) declaraba `sourceModule: "VIGIA"` — es decir, se atribuía falsamente a reportes ciudadanos reales. Se corrigió a `sourceModule: "MANUAL"`, el valor que el propio motor de scoring (`hermesRouteScoring.ts:73,85`) ya esperaba para fixtures manuales (les quita la atribución de fuente en las advertencias). Como efecto secundario correcto: `linkedReports` (`hermesRouting.ts:113`, que filtra por `sourceModule === "VIGIA"`) deja de enlazar IDs de bloqueos demo como si fueran reportes VIGÍA reales.

**Conservado para vista previa (ya declarado, sin cambios funcionales):**
- `hermesDemoBlockages`, `arcaDemoShelters`, `auraDemoMedicalPoints`/`auraDemoTriageCases`/`auraDemoStock`, `custosDemoResults`/`custosDemoAuditTrail`/`custosDemoReason`, `talosDemoAssessments` (consumido por HERMES vía puente).

**Bloqueado en producción:** ninguno de estos fixtures depende de `isDemoDataAllowed()`/`isDemoLikeSource()` — son datos de módulo (no datos de ingesta de fuentes externas), y su exposición ya está limitada por la clasificación `preview`/`partially_operational` explícita, no por el guard de producción de `src/lib/security/productionGuard.ts` (ese guard protege la ingesta real de fuentes, no estos fixtures de UI).

**Candidatos a eliminación:** ver `docs/modules/ARGUS_MODULE_LEGACY_CANDIDATES.md`.

## 6. Bridges

| Bridge | Consumidor | Estado | Acción aplicada |
|---|---|---|---|
| `hermesVigiaBridge.ts` | `HermesDashboard.tsx` | active | Ninguna (real) |
| `hermesTalosBridge.ts` | `HermesDashboard.tsx` (sobre `talosDemoAssessments`) | active, pero sobre datos siempre demo | Ninguna funcional; documentado en la matriz de verdad |
| `hermesAtlasBridge.ts` | `HermesDashboard.tsx` (preparación, sin envío automático) | partial | Ninguna |
| `hermesArcaBridge.ts` | Nadie (`ArcaDashboard` llama `calculateHermesRoutes` directo) | unused | Documentado como candidato legacy |
| `hermesAuraBridge.ts`, `hermesFenixBridge.ts`, `hermesNexusBridge.ts`, `hermesOraculoBridge.ts` | Nadie | unused | Documentado como candidato legacy |
| `arcaVigiaBridge.ts` | `ArcaDashboard.tsx` (solo cuenta, resultado descartado) | partial | Ninguna |
| `arcaAtlasBridge.ts` | `ArcaDashboard.tsx` | active | Ninguna |
| `arcaHermesBridge.ts`, `arcaAuraBridge.ts`, `arcaFenixBridge.ts`, `arcaNexusBridge.ts`, `arcaOraculoBridge.ts`, `arcaTalosBridge.ts` | Nadie | unused | Documentado como candidato legacy |
| `auraAtlasBridge.ts` | `AuraDashboard.tsx` | active | Ninguna |
| `auraArcaBridge.ts`, `auraFenixBridge.ts`, `auraHermesBridge.ts`, `auraNexusBridge.ts`, `auraOraculoBridge.ts`, `auraTalosBridge.ts`, `auraVigiaBridge.ts` | Nadie | unused | Documentado como candidato legacy |
| 7 puentes de CUSTOS (`custosArcaBridge.ts`, `custosAtlasBridge.ts`, `custosAuraBridge.ts`, `custosHermesBridge.ts`, `custosOraculoBridge.ts`, `custosTalosBridge.ts`, `custosVigiaBridge.ts`) | Nadie | unused | Documentado como candidato legacy |
| `fenixNexusBridge.ts`, `auraNexusBridge.ts`, `arcaNexusBridge.ts`, `hermesNexusBridge.ts` (los 4 "NEXUS bridges") | Nadie | dead (0 importadores confirmado por test automatizado) | Test de regresión agregado (`nexus-stabilization.test.ts`) para que ninguno pueda presentarse como activo sin que el test falle primero |

Ningún bridge se calificó como `unsafe`: todos son funciones puras sin efectos secundarios; el único que ejecuta lógica real si se invocara (`hermesNexusBridge.ts`, llama a `calculateHermesRoutes`) sigue sin tener ningún llamador.

## 7. Privacidad

- **HERMES**: no maneja datos personales directamente; los bloqueos derivados de VIGÍA no exponen datos de contacto del reportante (ya así antes de esta tarea).
- **AURA**: el perfil médico opcional vive solo en `useState` del navegador (nunca se envía ni persiste); `sanitizeAuraMedicalProfileForRole` redacta el perfil demo por rol; el audit log (`auraAudit.ts`) solo registra IDs, nunca diagnóstico/grupo sanguíneo/notas — sin cambios necesarios, ya cumplía. Se agregó un test de regresión (`aura-stabilization.test.ts`) que verifica que un rol público no reciba grupo sanguíneo ni contacto de emergencia.
- **CUSTOS**: los resultados demo ya vienen redactados por nivel de acceso (`custosPrivacy.ts`); el audit log no registra el contenido de la búsqueda, solo metadatos (`searchId`, `resultCount`, `caseId`). Sin cambios necesarios.

## 8. Archivos modificados

- `src/types/argusModule.ts` — tipo `ModuleMaturity`, campos `maturity`/`maturityNotes`.
- `src/data/argusModules.ts` — clasificación de HERMES/ARCA/AURA/CUSTOS/NEXUS.
- `src/components/modules/ModuleMaturityBadge.tsx` — nuevo.
- `src/components/modules/ModulePlaceholder.tsx` — badge de madurez + notas (NEXUS).
- `src/modules/hermes/components/HermesDashboard.tsx` — badge de madurez en el banner existente.
- `src/modules/hermes/components/HermesRouteCard.tsx` — etiqueta "Simulada" por ruta.
- `src/modules/hermes/data.ts` — **fix de etiquetado**: `sourceModule` de los 4 bloqueos demo, de `"VIGIA"` (falso) a `"MANUAL"` (correcto).
- `src/modules/arca/components/ArcaHeader.tsx` — prop `maturity` + badge.
- `src/modules/arca/components/ArcaDashboard.tsx` — badge de madurez; **fix de permisos**: `canPlanRoute` real en vez de literal `true`.
- `src/modules/arca/components/ArcaNearbySheltersPanel.tsx` — **fix de permisos**: nuevo prop `canPlanRoute`, botón ahora gateado.
- `src/modules/aura/components/AuraDashboard.tsx` — badge de madurez; capacidad "(estimada, no confirmada)" por punto.
- `src/modules/custos/components/CustosDashboard.tsx` — badge de madurez en el banner existente.
- `tests/p0/hermes-stabilization.test.ts`, `arca-stabilization.test.ts`, `aura-stabilization.test.ts`, `custos-stabilization.test.ts`, `nexus-stabilization.test.ts`, `module-registry-maturity.test.ts` — nuevos.
- `docs/modules/ARGUS_SECONDARY_MODULE_STABILIZATION.md`, `ARGUS_MODULE_CAPABILITY_TRUTH_MATRIX.md`, `ARGUS_MODULE_LEGACY_CANDIDATES.md` — nuevos.

No se modificó Prisma, cron, scheduler, ni ATLAS/VIGÍA/ORÁCULO/TALOS/FÉNIX.

## 9. Riesgos pendientes

- El gate de acceso de los 5 módulos sigue siendo client-side (mismo patrón que el resto de la app, no introducido aquí). Un endpoint privilegiado dedicado a alguno de estos módulos (si se crea en el futuro) debe replicar el patrón server-side real que ya existe en `src/lib/modules/moduleOperationalContext.ts`, no confiar solo en el componente React.
- CUSTOS y NEXUS declaran `requiresAudit: true` pero la auditoría (`auditModuleAccess`, `auditCustosAction`) solo escribe a consola fuera de producción — persistencia real a `prisma.AuditLog` queda como trabajo futuro explícito (ya documentado en `futureIntegrations` de CUSTOS).
- AURA tiene un modelo de acceso paralelo sin usar (`AURA_PRO` en `src/lib/access/accessPolicy.ts`) que nunca se cruza con `auraAccess.ts` — riesgo de confusión si alguien intenta usarlo pensando que gobierna el módulo real.
- El dataset médico real de AURA (`CriticalPoi` + `osmMedicalContext.ts`) ya existe en el repo, tageado para AURA, pero no está conectado — es la vía más directa para que AURA deje de ser `partially_operational` y pase a `operational`, pero conectarlo es una funcionalidad nueva, fuera de este prompt.
- 20 archivos de puentes muertos (7 CUSTOS + 4 NEXUS + 9 entre ARCA/HERMES/AURA) quedan inventariados para el Prompt 20 (limpieza técnica), sin eliminar aquí.
