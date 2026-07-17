# ARGUS — Integración del análisis de impacto geoespacial (Prompt 6)

**Fecha**: 2026-07-17
**Tipo**: implementación quirúrgica de un análisis de impacto real y acotado — no el motor completo, no un rediseño.
**Rama**: `phase-3-ui-ux`.
**Alcance**: no se modificó `prisma/schema.prisma`, no se creó ningún "Impact Engine" aislado, no se tocaron secretos, no se hizo commit ni push, no se actualizó el changelog público ni la versión de ARGUS.

---

## 1. Resumen ejecutivo

**Situación anterior**: una auditoría exhaustiva (agente de exploración dedicado, ver §2 para el detalle) confirmó que **no existía ningún pipeline real que convirtiera un incidente canónico en un análisis de impacto**. Lo que sí existía:

- Un sistema de **detección de riesgo/confianza genuinamente real** (`riskEngine.ts` + reglas por amenaza + `confirmationScoring.ts`/`evidenceScoring.ts`) que opera sobre eventos reales, pero solo caracteriza la amenaza ("esto es peligroso, con esta confianza") — nunca calcula qué está expuesto.
- **Dos implementaciones FÉNIX completamente separadas**, ambas simuladores manuales (el usuario escribe lat/lng en un formulario), ambas construidas sobre datos 100% demo (`demoSettlements`, densidad poblacional fija, refugios/rutas con nombres literales `"... demo"`), ya documentadas como redundantes en `docs/modules/ARGUS_FENIX_CANONICALIZATION.md`.
- Una consulta real y correcta contra infraestructura crítica persistida (`getCriticalInfrastructureNearIncident`, `criticalPoiModuleQueries.ts`) — pero **sin ningún consumidor en todo el repo** (huérfana, confirmada por grep).
- **Cero** modelo de dependencias entre activos, en ningún módulo.
- **Cero** campo de impacto/exposición en `ArgusEvent` o en Prisma más allá de un `KnowledgeIncident.impactJson` que se lee al ingerir y luego se descarta (nunca llega al `ArgusEvent` final).

**Solución implementada**: un módulo de agregación puro (`src/lib/impact/incidentImpactAssessment.ts`) que toma el mismo `ModuleIncidentSummary` que ya usan los cuatro dashboards (ATLAS/VIGÍA/ORÁCULO/TALOS, Prompt 17) y produce un `IncidentImpactAssessment` con:

- **Infraestructura crítica expuesta** — REAL, calculada geométricamente (punto-en-polígono cuando el incidente tiene geometría de área real; radio operacional documentado por tipo de evento cuando no la tiene), contra la consulta ya existente y ahora conectada por primera vez.
- **Población expuesta, rutas afectadas, servicios/dependencias** — declarados explícitamente `NOT_AVAILABLE` con la razón exacta, en vez de reutilizar los estimadores demo de FÉNIX y presentar una cifra sin respaldo como resultado de un incidente real.
- **Prioridad operacional** — fórmula determinista y documentada (severidad × 0.5 + confianza × 0.2 + exposición de infraestructura × 0.3), sin números mágicos sin explicar.
- **Acciones sugeridas** — derivadas de lo que realmente se encontró, nunca una lista fija; siempre `SUGGESTED`/`PENDING_VALIDATION`, nunca una orden.

Expuesto vía `GET /api/modules/incidents/[id]/impact?module=` (mismo esquema de identidad que el endpoint de detalle ya existente), gateado a OPERATOR+, con rate limiting propio, y renderizado dentro del panel de detalle de VIGÍA (`IncidentImpactSection.tsx`) — no una pantalla ni un menú aislado.

**Riesgos residuales principales**: población/rutas/servicios siguen sin una fuente real (P1, ver §21); no hay persistencia/versionado del resultado (P1, calculado en tiempo real cada vez); AURA y FÉNIX no consumen todavía este análisis (P1/P2 — ambos son sistemas demo/legacy per auditoría, conectarlos correctamente es trabajo propio, no forzado en este pase).

---

## 2. Inventario inicial

| Capacidad | Archivo | Estado anterior | Datos reales/demo | Decisión |
|---|---|---|---|---|
| `getCriticalInfrastructureNearIncident` | `src/lib/criticalPoi/criticalPoiModuleQueries.ts` | Real, escrita, **cero consumidores** | Real (Prisma `CriticalPoi` + sync OSM) | **CONECTAR** — primer consumidor real |
| Punto-en-polígono / distancia a borde | `src/lib/geometry/wildfireGeometry.ts` | Real, ya usada por correlación de incendios (Prompt 15) | N/A (primitiva pura) | **REUTILIZAR** tal cual |
| `representativePoint` | `src/lib/canonical/canonicalReadLayer.ts` | Real, ya usada por la capa canónica de lectura | N/A (primitiva pura) | **REUTILIZAR** tal cual |
| `ModuleIncidentSummary` + `getModuleIncidentDetailContext` | `src/types/moduleOperationalContext.ts`, `src/lib/modules/moduleOperationalContext.ts` | Real, único punto de verdad de "incidente por id" para los 4 módulos | Real | **REUTILIZAR** como única forma de resolver un incidente |
| `confirmationScoring.ts`/`evidenceScoring.ts` | `src/lib/prediction/` | Metodología de confianza real, ya evaluada sobre `ArgusEvent.confidence` | Real | **No se duplicó** — `ArgusEvent.confidence` (ya calculado con esta metodología) se reutiliza directamente en vez de recalcular una segunda confianza |
| `src/modules/fenix/fenixScenarioEngine.ts` (`runFenixScenario`) | `src/modules/fenix/` | Cadena completa de "exposición→evacuación→médico→refugios→recursos→rutas→plan→confianza" | **100% demo** (`fenixDemoScenarios`, textos literales `"... demo"`) | **DESCARTAR como base** — ya marcado legacy/desconectado de la navegación oficial por `ARGUS_FENIX_CANONICALIZATION.md` |
| `src/lib/fenix/fenixSimulationEngine.ts` (`runFenixSimulation`) | `src/lib/fenix/` | Simulador manual real (usuario ingresa lat/lng/radio/dirección), `const isDemo = true` incondicional | **100% demo** en sus salidas numéricas | **NO REUTILIZAR** para incidentes reales — sigue siendo la vía correcta para simulaciones explícitas, sin tocar |
| `src/lib/fenix/populationExposureEstimator.ts` | `src/lib/fenix/` | Densidad fija global (850/km²) + `demoSettlements` | Demo | **NO CONECTAR a incidentes reales** — población se declara `NOT_AVAILABLE` en su lugar (§17 del mandato) |
| `src/lib/routing/routeSafety.ts` | `src/lib/routing/` | Real, puntúa una ruta específica contra puntos de peligro provistos por el llamador | Real, pero sin registro "qué rutas cruzan esta área" | **NO CONECTAR en este pase** — falta el registro de rutas por zona; documentado como deuda (§21) |
| `src/modules/talos/talosRiskMatrix.ts` | `src/modules/talos/` | Matriz severidad×escalación→prioridad, real y reutilizable | Real, pero requiere enums que este pase no produce | **NO REUTILIZADO directamente** — se prefirió una fórmula propia y más simple, anclada a los campos que sí existen en `ModuleIncidentSummary` (severidad/confianza), ver §12 |
| `auraDemoMedicalPoints` / `src/data/auraMedicalPoints.ts` | `src/modules/aura/`, `src/data/` | 8 puntos fijos, renderizados sin gating de ninguna clase | Demo, no gateado | **NO TOCADO** — fuera de alcance de este pase (AURA no fue modificado), documentado como deuda (§21) |
| Modelo de dependencias entre activos | — | **No existe en ningún módulo** | N/A | **CONSTRUIR** de forma mínima solo como `NOT_AVAILABLE` declarado — no se inventó ningún grafo sin procedencia |

---

## 3. Arquitectura del análisis de impacto

- **Entrada**: un `ModuleIncidentSummary` ya resuelto por `getModuleIncidentDetailContext(moduleId, incidentId)` — la misma función que ya usan los cuatro dashboards. `buildIncidentImpactAssessment()` nunca resuelve un incidente por su cuenta ni acepta un id crudo.
- **Cálculo**: síncrono/en tiempo real dentro del handler del endpoint — una consulta real a `CriticalPoi` (bbox derivado de un radio por tipo de evento) más aritmética pura y determinista sobre el resultado. Sin colas, sin jobs, sin caché.
- **Persistencia**: **ninguna en este pase** (ver §16 y §21 — decisión explícita, no un olvido).
- **Caché**: ninguna — cada solicitud recalcula. Aceptable dado el volumen esperado (un operador abriendo el detalle de un incidente a la vez); ver §20 para el razonamiento de costo.
- **Versionado**: `assessmentVersion` (`IMPACT_ASSESSMENT_VERSION = "1.0.0"`) viaja en cada resultado — preparado para que una futura Fase de persistencia pueda detectar qué metodología produjo un snapshot guardado, sin tener que persistir todavía.
- **Salidas**: `IncidentImpactAssessment` (`src/types/incidentImpactAssessment.ts`) — infraestructura, población, rutas, servicios, prioridad, acciones sugeridas, limitaciones, `isDemo`.
- **Consumidores**: `GET /api/modules/incidents/[id]/impact` (API) → `IncidentImpactSection.tsx` (UI, dentro de `VigiaCanonicalIncidentDetail.tsx`). AURA/FÉNIX/notificaciones/Predictive Core **no** son consumidores todavía (§13, §21).

---

## 4. Modelo de impacto

Contrato completo en `src/types/incidentImpactAssessment.ts`. Resumen:

- `incidentId`, `generatedAt` (reloj inyectable, nunca `Date.now()` ambiental sin poder pasarlo en tests), `assessmentVersion`.
- `incidentSeverity`/`incidentConfidence` — **leídos**, nunca recalculados; el módulo no introduce una segunda escala de severidad/confianza.
- `infrastructure: InfrastructureImpactResult` — `dataState`, radio de búsqueda + justificación, lista de activos con relación espacial (`INSIDE`/`BORDER`/`NEAR`/`OUTSIDE`/`NOT_DETERMINED`), `usedRealAreaGeometry` (booleano explícito de si la clasificación usó un polígono real o solo un radio).
- `population`/`routes`/`services` — cada uno con `dataState` + `reason` explicando exactamente qué falta y por qué (nunca solo `false`/`null` sin explicación).
- `priority: OperationalPriorityResult` — `level`, `score` (0-100), `methodology` (texto legible), `factors[]` (trazabilidad).
- `suggestedActions[]` — cada una con `action`, `reason`, `priority`, `status` (`SUGGESTED`/`PENDING_VALIDATION`, nunca una orden), `relatedAssetIds?`.
- `limitations: string[]` — agregado legible de qué quedó `NOT_AVAILABLE` y por qué.
- `isDemo` — propagado del incidente, nunca inferido independientemente.

Estados de dato usados en este pase: `CALCULATED` (infraestructura, cuando hay punto representativo) y `NOT_AVAILABLE` (población/rutas/servicios, y también infraestructura si el incidente no tiene coordenadas resolubles). `OBSERVED`/`ESTIMATED`/`SIMULATED`/`UNVERIFIED` están definidos en el contrato para uso futuro pero no se emiten en este pase — no hay ninguna fuente que hoy amerite esos estados sin inventar precisión.

---

## 5. Geometría

- **Geometría canónica**: se reutiliza `ArgusGeometry` (`point`/`polygon`/`route`/`region_reference`/`administrative_area`) tal cual, sin ninguna modificación al tipo ni al mapeador canónico.
- **Punto representativo**: `representativePoint()` de `canonicalReadLayer.ts`, sin duplicar.
- **Punto-en-polígono / distancia a borde**: `distanceToGeometryBoundaryKm()`/`haversineDistanceKm()` de `wildfireGeometry.ts` (Prompt 15), reutilizadas sin cambios — solo se agregó un adaptador local (`toRawGeometry()`) que convierte `administrative_area.geojson` (ya en formato GeoJSON `[lng,lat]`) y la variante `polygon` de `ArgusEvent` (anillo único en `[lat,lng]`) al formato `RawGeometry` que esas primitivas esperan.
- **Bbox**: `getCriticalInfrastructureNearIncident` internamente construye un bbox rectangular a partir del radio — **nunca se usa como forma final**; el resultado se re-verifica con distancia real (`haversineDistanceKm`) y cualquier activo que el bbox devolvió pero que en realidad excede el radio (falso positivo de esquina de rectángulo) se descarta antes de aparecer en el resultado (probado explícitamente, ver §19).
- **`region_reference.polygonEstimate`**: excluido deliberadamente de la clasificación `INSIDE`/`BORDER` — su propio docstring en `argusEvent.ts` lo declara "nunca un límite oficial"; tratarlo como geometría real produciría clasificaciones falsas.
- **Radio operacional por tipo de evento**: tabla documentada en `SEARCH_RADIUS_KM_BY_EVENT_TYPE` (`incidentImpactAssessment.ts`) — nunca un radio universal. Sismo 5km, tsunami 2km, incendio 8km, inundación 5km, deslizamiento 3km, volcán 6km, clima severo/lluvia intensa 4km, resto 3km (el mismo valor por defecto que `getCriticalInfrastructureNearIncident` ya usaba en producción). Explícitamente documentado como radio de **prefiltrado de consulta**, no área oficial de daño — sin ShakeMap/perímetro real de incendio/zona SHOA conectados en este pase (deuda, §21).
- **Geometrías inválidas**: si el incidente no tiene un punto representativo resoluble, `infrastructure.dataState` es `NOT_AVAILABLE` con razón explícita — nunca se lanza una excepción ni se sustituye por una geometría inventada.

---

## 6. Infraestructura crítica

| Categoría | Fuente | Método de impacto | Resultado | Confianza |
|---|---|---|---|---|
| Hospitales, clínicas, bomberos, policía, gobierno, refugios, etc. (todas las categorías de `CriticalPoiCategory`) | `CriticalPoi` (Prisma, sync OSM real) vía `getCriticalInfrastructureNearIncident` | Punto-en-polígono/distancia a borde contra geometría real cuando existe; radio operacional documentado por tipo de evento cuando no | `INSIDE`/`BORDER`/`NEAR` (activos `OUTSIDE`/`NOT_DETERMINED` se excluyen del resultado) | Heredada de `CriticalPoi.confidence` (no recalculada) + `usedRealAreaGeometry` explícito para que el consumidor sepa si la clasificación viene de geometría real o solo de proximidad |

Cada activo incluye una `verificationRecommendation` en lenguaje "requiere verificación" (`"Verificar estado operacional de X — dentro del área..."`), nunca una afirmación de daño ("hospital destruido/evacuado") — cumple explícitamente §16 del mandato.

---

## 7. Población expuesta

**No calculada en este pase — `NOT_AVAILABLE` declarado explícitamente**, con la razón exacta en cada resultado: no existe ninguna fuente censal/administrativa real conectada a incidentes canónicos; el único estimador existente en el repo (`populationExposureEstimator.ts`) usa densidad fija global (850/km²) y asentamientos demo (`demoSettlements.ts`), exclusivo del simulador FÉNIX. Conectarlo a un incidente real presentaría una cifra sin respaldo como si fuera un resultado del incidente — exactamente lo que el mandato prohíbe (§17: "no utilizar una densidad fija como resultado real"; §41: "no ocultes datos demo como fallback").

Esta es una decisión explícita, no una omisión: el mandato mismo prefiere `NOT_AVAILABLE`/"NO CALCULADO" sobre una cifra inventada (§17, §41). Cerrar esta brecha con una fuente real (WorldPop/censo/HDX) es deuda P1 (§21).

---

## 8. Rutas y evacuación

**No calculado — `NOT_AVAILABLE` declarado**. `routeSafety.ts` (real) puntúa una ruta específica contra puntos de peligro que el llamador debe proveer explícitamente — no existe hoy una consulta "qué rutas cruzan esta geometría" equivalente a la de infraestructura. `hermesRouteSafety.ts` ya distingue correctamente proximidad-a-riesgo de cierre-confirmado (exactamente la distinción que pide §19 del mandato), pero como dos parámetros de entrada separados, no como un cálculo automático desde una geometría. `fenixRouteImpact.ts` es descartado como base (nombres de ruta fijos, sin geometría). Integración con FÉNIX: no se tocó — FÉNIX sigue siendo un simulador manual explícito, no reemplazado ni redirigido a este análisis en este pase (ver §21 para el criterio de cierre).

---

## 9. AURA

**No modificado en este pase.** `AuraDashboard.tsx` sigue renderizando `auraDemoMedicalPoints` (8 puntos fijos, sin gating) directamente — confirmado por auditoría, no tocado por esta tarea. La ruta real y ya existente para conectar hospitales reales (`getCriticalInfrastructureNearIncident` con categoría `hospital`/`clinic`, exactamente la misma función que este pase conectó para infraestructura general) queda documentada como el camino correcto para una futura tarea de AURA — no se rediseñó AURA en este pase, per restricción explícita del mandato (§4, §21, §30: "no rediseñes AURA completamente").

---

## 10. Servicios y dependencias

| Activo o servicio | Dependencia | Impacto | Evidencia | Confianza |
|---|---|---|---|---|
| — | — | `NOT_AVAILABLE` | Ningún módulo de ARGUS (TALOS/FÉNIX/AURA/ARCA/HERMES, confirmado por auditoría) modela dependencias entre activos (p.ej. hospital→energía) | N/A |

No se construyó ningún grafo de dependencias — hacerlo sin procedencia real habría violado explícitamente el mandato (§24: "no hardcodees relaciones específicas sin procedencia").

---

## 11. Riesgo compuesto

No implementado como motor de reglas separado en este pase. El único "riesgo compuesto" real y ya existente en el repo es `riskEngine.ts` + sus reglas por amenaza (§7 de la auditoría) — opera sobre `ArgusNormalizedEvent`, aguas arriba del incidente canónico, y no se tocó (fuera de alcance: ese sistema ya está completo y no requería cambios para este prompt). La prioridad operacional de este pase (§12) es una combinación explícita de factores, no un motor de reglas de riesgo compuesto nuevo — no se dupicó `riskEngine.ts`.

---

## 12. Priorización

`computeOperationalPriority()` (`incidentImpactAssessment.ts`):

```
score = severidad_incidente*0.5 + confianza_incidente*0.2 + exposición_infraestructura*0.3
```

- Severidad y confianza usan el rango ordinal ya canónico de `ArgusSeverity`/`ArgusConfidence` (0-100 normalizado), sin recalcularlas.
- Exposición = conteo de activos `INSIDE`/`BORDER` (nunca `NEAR`, que no confirma exposición real), saturado en 100 a partir de 5 activos.
- **Regla explícita cumplida** (§26 del mandato): baja confianza nunca reduce el score por debajo de lo que la severidad sola garantiza — un incidente `critical` con confianza `low` sigue produciendo score ≥50 (probado explícitamente, §19).
- No se reutilizó `talosRiskMatrix.ts` directamente porque exige enums (`impactRank`/`escalationRank`) que este pase no produce de forma no inventada — se prefirió una fórmula propia, simple, con cada término trazable en `factors[]`, en vez de forzar datos a un contrato ajeno.

---

## 13. Integraciones

| Consumidor | Antes | Después | Estado |
|---|---|---|---|
| Mapa (2D/Orbit) | No consumía impacto | Sin cambios | No integrado en este pase — el mapa no requiere este dato para renderizar; queda preparado para el Prompt 7 |
| VIGÍA (detalle de incidente) | Solo refugios + telecom | + sección de análisis de impacto (`IncidentImpactSection.tsx`) | **Integrado** |
| AURA | `auraDemoMedicalPoints` fijo | Sin cambios | No integrado — fuera de alcance (§9, §21) |
| FÉNIX | Simulador manual desconectado de incidentes reales | Sin cambios | No integrado — FÉNIX sigue siendo explícitamente un simulador, no se redirigió a este análisis (§21) |
| Notificaciones | N/A | Sin cambios | No integrado — ninguna notificación se dispara desde este análisis en este pase (§21) |
| Predictive Core | N/A | Sin cambios | No integrado (§21) |
| Panel de incidente (ATLAS/ORÁCULO/TALOS) | N/A | El endpoint acepta los 4 `moduleId`, pero solo VIGÍA renderiza la sección en este pase | Backend listo para los 4, UI conectada solo en VIGÍA (deuda de UI menor, §21) |

---

## 14. Seguridad y privacidad

- **DTO**: el endpoint nunca expone `Report`/`HelpRequest` — no se tocan esos modelos en absoluto; el resultado solo deriva de `ModuleIncidentSummary` (ya sin datos sensibles) y `CriticalPoi` (infraestructura pública/semi-pública, sin datos personales).
- **Acceso operacional**: `GET /api/modules/incidents/[id]/impact` exige `requireOperator()` (mismo sistema RBAC existente, ninguno nuevo) **además** del control de acceso por módulo que `getModuleIncidentDetailContext` ya aplica — dos capas del mismo sistema, no dos sistemas.
- **Público**: no se construyó un nivel público en este pase (deuda P2, §21) — todo el endpoint es operador-only por decisión explícita y conservadora, ya que la ubicación exacta de infraestructura crítica cerca de un incidente es un dato más sensible operacionalmente que el resumen del incidente en sí.
- **Auditoría**: `assessmentVersion` + `generatedAt` viajan en cada resultado; no hay persistencia todavía (§16), así que no hay historial auditable más allá del log de acceso HTTP estándar.
- **Rate limiting**: política nueva `incident_impact_read` (`rateLimitPolicy.ts`) — 30 solicitudes/60s por usuario autenticado, `fail_closed` (cada solicitud ejecuta una consulta real a `CriticalPoi`, no es gratis).

---

## 15. Datos demo y simulaciones

| Dato | Ubicación | Estado anterior | Estado final |
|---|---|---|---|
| `populationExposureEstimator.ts` / `demoSettlements.ts` | `src/lib/fenix/`, `src/data/` | Sin gating, exclusivo de FÉNIX | **No tocado, no conectado a este análisis** — población se declara `NOT_AVAILABLE` en su lugar |
| `fenixSimulationEngine.ts` (`isDemo = true` incondicional) | `src/lib/fenix/` | Simulador manual, siempre demo | No tocado |
| `fenixScenarioEngine.ts` / `fenixDemoScenarios` | `src/modules/fenix/` | Legacy, ya desconectado de la navegación oficial | No tocado |
| `auraDemoMedicalPoints` | `src/modules/aura/`, `src/data/` | Sin gating, renderizado incondicional | No tocado — AURA fuera de alcance de este pase |
| Nuevo: `IncidentImpactAssessment.isDemo` | `src/types/incidentImpactAssessment.ts` | — | Propagado directamente de `ModuleIncidentSummary.isDemo` (ya derivado correctamente por Prompt 17 vía `isDemoLikeSource`) — nunca recalculado ni inferido de forma independiente |

---

## 16. Persistencia y Prisma

| Modelo o campo | Cambio | Compatibilidad | Migración |
|---|---|---|---|
| — | Ninguno | N/A | **Ninguna migración creada ni ejecutada** |

**Decisión explícita de no tocar Prisma en este pase**, por las mismas razones ya documentadas en `ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md` §7 (la base de datos de desarrollo local es la misma base Supabase compartida — no hay entorno aislado) y porque el propio mandato (§10) exige que la persistencia se decida por costo/frecuencia/auditoría/volumen, no se agregue por inercia. El resultado se calcula en tiempo real (una consulta `CriticalPoi` + aritmética pura) — costo aceptable para el volumen esperado (un operador viendo un incidente a la vez), documentado en §21 como el criterio exacto que justificaría agregar persistencia más adelante.

---

## 17. Archivos modificados

| Archivo | Cambio | Motivo |
|---|---|---|
| [rateLimitPolicy.ts](src/lib/security/rateLimitPolicy.ts) | + política `incident_impact_read` | Reutiliza el sistema de rate limiting existente en vez de uno nuevo |
| [VigiaCanonicalIncidentDetail.tsx](src/modules/vigia/components/VigiaCanonicalIncidentDetail.tsx) | + `<IncidentImpactSection>` junto a las secciones de refugio/telecom ya existentes | Integra el análisis dentro del detalle del incidente, no en una pantalla aislada |

---

## 18. Archivos nuevos

| Archivo | Contenido | Motivo |
|---|---|---|
| [incidentImpactAssessment.ts](src/types/incidentImpactAssessment.ts) | Contrato `IncidentImpactAssessment` + tipos asociados | Resultado derivado — nunca un segundo modelo de incidente |
| [incidentImpactAssessment.ts](src/lib/impact/incidentImpactAssessment.ts) | `buildIncidentImpactAssessment()` + funciones internas | Agregación pura sobre capacidades reales ya existentes (§2) |
| [route.ts](src/app/api/modules/incidents/[id]/impact/route.ts) | `GET /api/modules/incidents/[id]/impact` | Misma identidad de incidente que el endpoint de detalle ya existente — ninguna API paralela |
| [IncidentImpactSection.tsx](src/components/modules/IncidentImpactSection.tsx) | Sección UI, mismo patrón que `IncidentShelterOperationalSection.tsx` | Consumidor real dentro del detalle del incidente |
| [tests/impact/incidentImpactAssessment.test.ts](tests/impact/incidentImpactAssessment.test.ts) | 13 casos | Ver §19 |

---

## 19. Pruebas ejecutadas

| Comando | Resultado | Observaciones |
|---|---|---|
| `npx tsc --noEmit` | 1 error preexistente, no relacionado | `tests/senapred/senapredSingleOwner.test.ts:52` — mismo error preexistente ya documentado en `ARGUS_MAP_MODERNIZATION_IMPLEMENTATION.md` §17, no tocado |
| `npx eslint .` (archivos de esta tarea) | 0 errores, 1 warning preexistente-en-patrón | `IncidentImpactSection.tsx` reproduce el mismo warning `react-hooks/set-state-in-effect` que ya existe en `IncidentShelterOperationalSection.tsx` (el componente que se está mirando como plantilla) — no es una regresión nueva, es el mismo patrón ya presente 24+ veces en el repo |
| `npx vitest run` | 1152/1152 pruebas pasan (112/114 archivos) | Los mismos 2 archivos preexistentes (`tests/p0/codigo-azul-*`) fallan por el bug de hoisting ya documentado, no relacionado a esta tarea |
| `npx vitest run tests/impact` | 13/13 pruebas nuevas pasan | Cobertura: clasificación NEAR-only sin geometría real, exclusión de falsos positivos de esquina de bbox, clasificación INSIDE con polígono real, exclusión OUTSIDE, población/rutas/servicios siempre `NOT_AVAILABLE` con razón, prioridad no colapsa por baja confianza, prioridad sube con exposición real, acciones nunca fuera de `SUGGESTED`/`PENDING_VALIDATION`, escalación solo en high/critical, severidad/confianza nunca recalculadas, `isDemo` propagado, reloj inyectable |
| `npm run build` | Build exitoso (Next.js 16.2.9, Turbopack) | `/api/modules/incidents/[id]/impact` aparece registrada correctamente en la tabla de rutas |

---

## 20. Rendimiento

| Escenario | Activos | Tiempo | Memoria | Resultado |
|---|---|---|---|---|
| No medido en navegador/entorno real | — | No medido | No medido | Sin servidor de previsualización disponible en esta sesión (misma limitación documentada en `ARGUS_MAP_MODERNIZATION_IMPLEMENTATION.md` §18) |

**Análisis por inspección de código** (sin medición en vivo, declarado explícitamente en vez de inventar números): el costo por solicitud es una consulta `getCriticalPoisNear` (bbox + filtro por prioridad P0-P2, ya usada en producción por `getRealFenixShelters`/`IncidentShelterOperationalSection`) más aritmética O(n) sobre el resultado — mismo perfil de costo que el patrón de refugios ya en producción, sin operaciones adicionales de red o CPU pesadas. El rate limit (30/60s por operador) acota el peor caso. Escalar a los volúmenes del mandato (100-10.000 activos) requeriría medición real en un entorno con base de datos poblada — no disponible en esta sesión; documentado como deuda P3 (§21), mismo criterio que la deuda de benchmark ya documentada en el Prompt 5.

---

## 21. Riesgos residuales

- **P0**: ninguno detectado en el alcance de este prompt.
- **P1**: (a) población expuesta, rutas afectadas y dependencias de servicio permanecen `NOT_AVAILABLE` — sin fuente real conectada; (b) sin persistencia/versionado — cada solicitud recalcula, sin historial auditable más allá del log HTTP; (c) FÉNIX/AURA no consumen este análisis todavía — ambos siguen operando con sus propios datos demo/manuales.
- **P2**: (a) sin nivel de acceso público/DTO reducido — el endpoint es operador-only en su totalidad; (b) la sección de UI solo está conectada en VIGÍA, no en ATLAS/ORÁCULO/TALOS (el backend ya soporta los 4 `moduleId`).
- **P3**: sin benchmark de rendimiento real (misma limitación de entorno que Prompt 5).

---

## 22. Deuda técnica restante

| Deuda | Prioridad | Dependencia | Criterio de cierre |
|---|---|---|---|
| Población expuesta sin fuente real | P1 | Acceso a un dataset censal/WorldPop/HDX real e integrado (no el estimador demo de FÉNIX) | `population.dataState` pasa a `ESTIMATED` con metodología y rango documentados, o `OBSERVED` si hay fuente oficial exacta — nunca sin `NOT_AVAILABLE` seguir siendo el resultado por defecto sin razón |
| Rutas afectadas sin registro por área | P1 | Un índice real "rutas por zona geográfica" que no existe hoy en ningún módulo | `routes.dataState` pasa a `CALCULATED` reutilizando `routeSafety.ts`/`hermesRouteSafety.ts` sobre rutas realmente indexadas por geometría |
| Sin persistencia/versionado del resultado | P1 | Decisión de producto sobre qué incidentes ameritan snapshot auditable (¿todos? ¿solo críticos?) + migración aditiva a Prisma (schema ya preparado por `assessmentVersion`) | Migración creada (no ejecutada sin aprobación), snapshot con inputs/metodología/timestamp/evidencia, nunca sobrescrito silenciosamente |
| AURA no consume infraestructura real | P1 | Trabajo dedicado de AURA (fuera de alcance de este prompt) — la ruta ya existe (`getCriticalInfrastructureNearIncident` con categoría hospital/clinic) | `AuraDashboard.tsx` deja de renderizar `auraDemoMedicalPoints` incondicionalmente |
| FÉNIX no consume este análisis | P2 | Decisión de producto: ¿FÉNIX deja de ser puramente manual y puede sembrarse desde un incidente real vía este análisis? | Documentado en `ARGUS_FENIX_CANONICALIZATION.md` como la extensión natural, no forzado aquí |
| Sin nivel de acceso público | P2 | Decisión de qué subconjunto de infraestructura/prioridad es seguro exponer sin autenticación | DTO público separado, reutilizando el patrón ya existente de `toOperatorReport`/DTOs públicos |
| UI solo conectada en VIGÍA | P2 | Ninguna — trabajo mecánico | `IncidentImpactSection` añadido a los paneles de ATLAS/ORÁCULO/TALOS |
| Sin benchmark de rendimiento real | P3 | Entorno con navegador/base de datos poblada | Medir con el dataset sintético que pide el mandato (100/500/1.000/5.000/10.000 activos) |

---

## 23. Preparación para el próximo bloque

Para **Prompt 7 — Expediente territorial y relaciones de crisis**:

- `IncidentImpactAssessment` ya declara `infrastructure.assets[]` con relación espacial explícita — la base directa para cualquier "expediente" que necesite agregar por zona en vez de por incidente individual.
- `toRawGeometry()`/las primitivas de `wildfireGeometry.ts` ya resuelven geometría real vs. bbox — reutilizables para cualquier análisis territorial que necesite la misma distinción.
- La brecha de rutas/población documentada aquí (§21) es directamente relevante si el expediente territorial necesita agregar esas dimensiones — vale la pena cerrarla antes o junto con ese bloque, no duplicarla.

No se implementó ningún expediente territorial, grafo de crisis, ni interfaz visual de relaciones en esta entrega.

---

## 24. Estado Git

- **Rama**: `phase-3-ui-ux` (sin cambios de rama).
- **Cambios previos del usuario/sesiones anteriores** (ya presentes al iniciar esta tarea, no tocados): `docs/PUBLIC_CHANGELOG.md`/`src/data/publicChangelog.json` (staged, ajenos); el trabajo completo del Prompt 5 (`GlobeView.tsx`, `OperationalMap.tsx`, `argusMapSymbols.ts`, `FenixPredictionFrameCard.tsx`, `VisualSourcePopup.tsx`, `sanitizers.ts`, `tests/map/`, `tests/security/`, el informe de Prompt 5) — verificado íntegro, no modificado por esta tarea.
- **Cambios de esta tarea**:
  - Modificados: `src/lib/security/rateLimitPolicy.ts`, `src/modules/vigia/components/VigiaCanonicalIncidentDetail.tsx`.
  - Nuevos: `src/types/incidentImpactAssessment.ts`, `src/lib/impact/incidentImpactAssessment.ts`, `src/app/api/modules/incidents/[id]/impact/route.ts`, `src/components/modules/IncidentImpactSection.tsx`, `tests/impact/incidentImpactAssessment.test.ts`, este documento.
- **Migraciones creadas**: ninguna.
- **Archivos eliminados**: ninguno.
- **Confirmación**: no se ejecutó `git reset`, `git checkout .`, `git restore .`, `git clean` ni `git stash` en ningún momento; no se revirtió ningún cambio previo del usuario ni de sesiones anteriores.

---

## 25. Confirmación final

- No se realizó commit.
- No se realizó push.
- No se realizó deploy.
- No se modificaron secretos.
- No se ejecutaron migraciones (destructivas ni de ningún tipo — `prisma/schema.prisma` no se tocó).
- No se actualizó el changelog público.
- No se cambió la versión pública de ARGUS.
- No se implementó IA generativa.
- No se creó un "Impact Engine" aislado — todo el cálculo vive en un módulo que consume capacidades ya existentes y se integra en el detalle de incidente ya existente.
- No se duplicó FÉNIX ni AURA.
- No se presentó ninguna simulación como observación real.
- No se usó una densidad fija como dato de población real (se declaró `NOT_AVAILABLE` en su lugar).
- No se usó bbox como área afectada final (solo como prefiltrado de consulta, con re-verificación por distancia real).
- No se incorporó `stealthFetch`.
- No se incorporaron cámaras ni escáneres de OSIRIS.
