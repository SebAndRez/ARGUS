# ARGUS — Expediente territorial y relaciones de crisis (Prompt 7)

**Fecha**: 2026-07-17
**Tipo**: implementación quirúrgica de un expediente territorial real y acotado — no una plataforma de inteligencia, no un grafo, no una base de datos nueva.
**Rama**: `phase-3-ui-ux`.
**Alcance**: no se modificó `prisma/schema.prisma`, no se creó ningún modelo de territorio/relación/organización/recurso nuevo en base de datos, no se adoptó ninguna base de grafos, no se tocaron secretos, no se hizo commit ni push, no se actualizó el changelog público ni la versión de ARGUS.

---

## 1. Resumen ejecutivo

**Situación anterior**: una auditoría dedicada (agente de exploración, ver §2) confirmó que **no existe ninguna entidad "Territorio"** en ARGUS — solo strings libres (`ArgusEvent.country/region/province/commune`, `CriticalPoi.adminLevel1/2`, etc.), cada uno poblado de forma independiente por su propio pipeline de ingesta, sin ninguna garantía de que "Región Metropolitana" esté escrita/codificada igual entre modelos. Tampoco existe: un directorio real de organizaciones/autoridades con contacto (`countrySourceRegistry.ts` cataloga *fuentes de datos*, no organismos); un modelo de relaciones incidente-a-incidente persistido y funcional (`ExternalEventCorrelation` está en el schema pero **huérfano**, sin ningún escritor ni lector; el único motor de correlación real, `correlateExternalEvents`, opera un nivel por debajo del incidente canónico y es enteramente efímero); ni un modelo de "acciones"/"decisiones operacionales" (existe `AuditLog`, real y conectado, pero genérico y sin las columnas que una decisión operacional necesitaría). El "Command Center" existente es, además, un sistema legacy incompatible (tipo de incidente distinto, `operational: false` literal en su propio código) — explícitamente **no** se integró con él.

**Solución implementada**: un expediente territorial compuesto (`TerritorialDossier`, `src/lib/territory/territorialDossier.ts`) que sigue exactamente el mismo idioma que el análisis de impacto del Prompt 6 (`buildIncidentImpactAssessment`): un punto de entrada único sobre el mismo `ModuleIncidentSummary` ya resuelto, un sub-constructor real por sección, y `UNAVAILABLE`/`NOT_APPLICABLE` explícito con razón documentada cuando no existe una fuente real — nunca una fabricación silenciosa. Compone:

- **Identidad territorial** — resuelta desde la geometría real del incidente cuando existe (`administrative_area`, ya resuelta contra límites administrativos reales por `argusGeometryResolver.ts`, Prompt 3/5), con fallback honesto a los campos canónicos (`countryCode`/`regionCode`) sin inventar un nivel administrativo que no puede verificarse.
- **Incidentes relacionados** — consulta real (`fetchCanonicalModuleIncidents`, ya existente) filtrada por el mismo `regionCode`, ordenada por severidad+recencia, nunca incluye el incidente origen.
- **Infraestructura y población** — **consumidas tal cual del `IncidentImpactAssessment` del Prompt 6, nunca recalculadas** (regla explícita del mandato §26).
- **Refugios** — reutiliza `getRealFenixShelters` (misma función ya conectada en producción a `IncidentShelterOperationalSection`).
- **Organizaciones y riesgos históricos** — declarados `UNAVAILABLE` con razón exacta: no existe ninguna fuente real para ninguno de los dos hoy.
- **Relaciones de crisis** — un vocabulario acotado a tres tipos que este pase puede derivar de forma real y determinista (`LOCATED_IN`, `AFFECTS`, `CORRELATED_WITH`), todas `CALCULATED` (nunca `CAUSED_BY` por proximidad — regla explícita del mandato §24), con confianza propia por relación, siempre separada de la confianza del incidente origen.

Expuesto vía `GET /api/modules/incidents/[id]/dossier?module=` (misma identidad de incidente que el endpoint de detalle e impacto), operador-gated, con rate limiting propio, renderizado dentro del detalle de VIGÍA.

**Riesgos residuales principales**: sin persistencia de relaciones (todo se calcula en tiempo real, no hay historial auditable — P1); sin directorio de organizaciones/autoridades ni de riesgos históricos (P1, sin fuente real que conectar todavía); AURA/FÉNIX no consumen este expediente (P1/P2, mismo motivo que en el Prompt 6 — ambos siguen siendo sistemas demo/manuales no tocados).

---

## 2. Inventario inicial

| Capacidad | Archivo | Estado anterior | Duplicación | Decisión |
|---|---|---|---|---|
| `ExternalEventCorrelation` | `prisma/schema.prisma:154-166` | Modelo declarado en el schema, **cero escritores, cero lectores** — completamente huérfano | Su forma (`kind`/`sourceIds`/`eventIds`/`confidence`/`explanation`) es un precedente útil pero fue diseñada para `ExternalEvent`, no para incidentes canónicos | **DESCARTAR como base de persistencia** — no se persistió ninguna relación en este pase (ver §16); si una futura fase persiste relaciones, este precedente de forma debería informar el diseño, no reutilizarse literalmente |
| `correlateExternalEvents` | `src/lib/ingestion/correlateExternalEvents.ts` | Real, conectado (`src/app/app/page.tsx`), pero opera sobre `ArgusNormalizedEvent` (una capa por debajo del incidente canónico) y es enteramente efímero (calculado en cada render, nunca persistido) | N/A | **NO REUTILIZADO directamente** — capa equivocada para relaciones de incidentes canónicos; su patrón de distancia+ventana temporal es un precedente de diseño, no una función a importar |
| `argusCorrelationEngine.ts::correlateSignals` | `src/lib/correlation/argusCorrelationEngine.ts` | Real función, pero su único consumidor es `src/data/demoArgusEvents.ts` (construcción de fixtures demo) — nunca conectada al pipeline real de ingesta | N/A | **NO REUTILIZADO** — efectivamente código muerto fuera de fixtures demo |
| `argusGeometryResolver.ts` | `src/lib/geometry/argusGeometryResolver.ts` | Real, ya usado por el mapeador canónico (Prompt 3/5) para resolver límites administrativos reales | N/A | **REUTILIZAR** — es la fuente de la identidad territorial de mayor confianza de este pase (vía `ArgusGeometry.administrative_area`, ya resuelto antes de que el expediente lo consuma) |
| `countrySourceRegistry.ts` | `src/lib/sources/countrySourceRegistry.ts` | Real, pero es un catálogo de **fuentes de datos** (APIs/feeds) por país, no un directorio de organizaciones/autoridades con contacto | N/A | **NO ES UN SUSTITUTO** de un directorio de organizaciones — documentado explícitamente para no presentarlo como si cubriera esa sección |
| `AuditLog` (Prisma) | `prisma/schema.prisma:86-95`, `src/services/auditService.ts` | Real, conectado, genérico (actor/acción/targetType/targetId/metadata) — el único log de auditoría real del repo | Los placeholders `*Audit.ts` por módulo (`talosAudit.ts`, etc.) son **console.info-only**, no escriben esta tabla | **NO EXTENDIDO en este pase** — sería el punto correcto para "decisiones operacionales" persistidas, pero requiere columnas nuevas (migración) fuera del alcance de esta entrega (ver deuda) |
| `getCriticalInfrastructureNearIncident` | `src/lib/criticalPoi/criticalPoiModuleQueries.ts` | Real, conectada por primera vez en el Prompt 6 | N/A | **REUTILIZAR indirectamente** — vía `buildIncidentImpactAssessment`, nunca llamada de nuevo directamente (evita recalcular impacto) |
| `getRealFenixShelters` | `src/lib/fenix/fenixShelterSource.ts` | Real, ya conectada en producción (`IncidentShelterOperationalSection.tsx`) | N/A | **REUTILIZAR** — llamada server-side directamente, sin round-trip HTTP interno |
| `fetchCanonicalModuleIncidents` | `src/lib/modules/canonicalIncidentGateway.ts` | Real, ya soporta filtro `regionCode` server-side | N/A | **CONECTAR** como consulta de "incidentes relacionados por territorio" — primer uso de este filtro con ese propósito |
| ARCA/AURA capacity (`arcaCapacity.ts`, `auraCapacity.ts`) | `src/modules/{arca,aura}/` | Lógica real, pero sobre datos 100% demo (`arcaDemoShelters`/`auraDemoMedicalPoints`), estrictamente más pobre que `CriticalPoiOperationalStatus` ya real | Reimplementación demo de lo que `CriticalPoiOperationalStatus` ya cubre mejor | **NO REUTILIZADO** — se usó el camino real (`getRealFenixShelters`) en su lugar |
| Command Center (`src/lib/command/`, `src/app/api/command/overview`) | — | Real como código, pero sobre un tipo de incidente distinto (`Incident`, no `ArgusEvent`/`KnowledgeIncident`), `operational: false` literal, demo-gated | Sistema paralelo preexistente, no creado por este pase | **NO INTEGRADO** — explícitamente fuera de alcance; integrarlo requeriría antes migrar el propio Command Center al incidente canónico, un trabajo que no le corresponde a este prompt |

---

## 3. Modelo territorial

- **Niveles**: no se creó una entidad `Territory` normalizada (ver §2 — no existe hoy, y crearla sin una estrategia de mantenimiento real habría violado el mandato §9: "no crees una copia masiva de territorios sin estrategia"). En su lugar, `TerritorialIdentity` (`src/types/territorialDossier.ts`) es una **proyección resuelta bajo demanda**, no persistida — la opción que el propio mandato ofrece explícitamente (§9: "resolución bajo demanda... la decisión debe estar justificada").
- **Identidad**: `countryCode`, `regionCode` (leídos tal cual del incidente canónico), más `intersectedAdministrativeAreas: string[]` — los nombres de área administrativa real que la geometría del incidente efectivamente cubre, derivados de `ArgusGeometry.administrative_area.regionNames` (ya resuelto contra un GeoJSON real de límites, Prompt 3/5).
- **Códigos**: no se inventó un código administrativo estable nuevo — se usa el `regionCode` que el incidente canónico ya trae.
- **Geometría**: nunca recalculada — se lee la que el incidente ya tiene.
- **Jerarquía**: deliberadamente **no** se afirma un nivel específico (región/provincia/comuna) cuando la única evidencia es un `regionCode` de un solo string sin nivel declarado — `resolutionMethod: "canonical_fields"` y `confidence: "medium"` documentan explícitamente esa limitación en vez de adivinar el nivel (mandato §12: "no inventes precisión cuando la geometría sea insuficiente").
- **Fuentes**: `argusGeometryResolver.ts` (vía la geometría ya resuelta del incidente) es la única fuente de mayor confianza; el resto es passthrough de campos ya canónicos.
- **Persistencia**: ninguna — cada solicitud resuelve la identidad territorial en tiempo real a partir de datos que el incidente ya trae, sin I/O adicional.

---

## 4. Resolución territorial

- **Coordenadas/geometría → territorio**: orden de resolución implementado en `resolveTerritorialIdentity()` (`src/lib/territory/territorialIdentityResolver.ts`): (1) geometría `administrative_area` real → nombres de área reales; (2) campos canónicos `countryCode`/`regionCode`; (3) solo punto representativo sin territorio; (4) sin resolver.
- **Intersección**: cuando la geometría es `administrative_area`, `intersectedAdministrativeAreas` puede contener más de un nombre (el mandato §12 exige exactamente esto: "un polígono puede afectar más de una comuna") — probado explícitamente (§20 de este documento).
- **Reverse geocoding**: **no se implementó** — la auditoría confirmó que no existe ninguna capacidad de reverse geocoding en el repo hoy (solo búsqueda/autocompletado hacia adelante vía Nominatim, sin guard SSRF aplicado). Agregar reverse geocoding habría sido una fuente externa nueva de facto y una superficie de riesgo (SSRF) fuera del alcance quirúrgico de este pase — documentado como deuda P2, no construido.
- **Caché**: ninguna — mismo criterio de costo que el Prompt 6 (ver §20 de ese informe).
- **Privacidad**: el expediente nunca toca `Report`/`HelpRequest` — solo compone `ModuleIncidentSummary` (ya sin datos sensibles), `CriticalPoi` (infraestructura pública/semi-pública vía el análisis de impacto) y refugios reales. No hay reverse geocoding de coordenadas privadas porque no hay reverse geocoding en absoluto en este pase.
- **Confianza**: `TerritorialIdentity.confidence` (`high`/`medium`/`low`/`unresolved`) es independiente de la confianza del incidente — nunca heredada automáticamente.

---

## 5. Expediente territorial

- **Contrato**: `TerritorialDossier` (`src/types/territorialDossier.ts`) — `territory`, `relatedIncidents`, `infrastructure`, `shelters`, `population`, `organizations`, `historicalRisks`, `relationships`, `overallStatus`, `limitations`, `isDemo`.
- **Secciones**: cada una envuelta en `DossierSection<T>` (`{status, data, reason?}`), con `status` en `AVAILABLE|PARTIAL|STALE|UNAVAILABLE|NOT_APPLICABLE` (Prompt 7 §41, vocabulario nuevo — no existía ninguno previo para este propósito exacto, documentado como tal).
- **Carga paralela**: `Promise.all([buildRelatedIncidentsSection(...), buildSheltersSection(...)])` — las dos únicas consultas de red independientes del expediente (infraestructura/población se leen síncronamente del resultado ya `await`eado de `buildIncidentImpactAssessment`, que a su vez ya paraleliza lo que puede). Una falla en cualquiera de las dos no bloquea la otra ni el resto del expediente — cada `buildXSection` atrapa su propio error y degrada a `UNAVAILABLE` con razón, nunca propaga una excepción hacia arriba.
- **Freshness**: `overallStatus` (`COMPLETE|PARTIAL|STALE|FAILED`) se deriva de los `status` de todas las secciones (`computeOverallStatus`) — nunca se declara `COMPLETE` porque una sola sección lo esté (probado explícitamente, §20).
- **Resultados parciales**: dado que organizaciones/riesgos históricos son siempre `UNAVAILABLE` en este pase (sin fuente real), `overallStatus` nunca es `COMPLETE` hoy — es un reflejo honesto del estado real del sistema, no un defecto del cálculo de estado.
- **Consumidores**: `GET /api/modules/incidents/[id]/dossier` (API) → `TerritorialDossierSection.tsx` (UI, dentro de `VigiaCanonicalIncidentDetail.tsx`, junto a `IncidentImpactSection` del Prompt 6).

---

## 6. Contexto institucional

| Territorio | Organismo | Rol | Fuente | Estado |
|---|---|---|---|---|
| — | — | — | — | **No implementado** — no existe ningún directorio real de organismos/autoridades con contacto/jurisdicción en el repo (confirmado por auditoría, §2). `countrySourceRegistry.ts` es un catálogo de fuentes de datos, no de organizaciones, y presentarlo como tal habría sido exactamente lo que el mandato prohíbe (§15: "no inventes nombres, teléfonos ni contactos... cuando no exista: NO DISPONIBLE") |

`organizations: UNAVAILABLE` con razón documentada es el resultado honesto en este pase.

---

## 7. Organizaciones y recursos

- **Modelos existentes revisados**: `arcaCapacity.ts`/`arcaAvailability.ts` (ARCA, demo), `auraCapacity.ts` (AURA, demo) — ninguno reutilizado, ambos estrictamente más pobres que `CriticalPoiOperationalStatus` (real, ya usado vía `getRealFenixShelters`).
- **Capacidades/disponibilidad**: solo la de refugios (`shelters`, real, vía `CriticalPoiOperationalStatus`) — ninguna otra clase de recurso (ambulancias, brigadas, personal, equipamiento) tiene una fuente real en el repo.
- **Jurisdicción**: no aplica — sin directorio de organizaciones no hay jurisdicción de organización que resolver.
- **Relaciones**: no se implementaron relaciones `RESOURCE_ASSIGNED_TO_INCIDENT`/`RESOURCE_OWNED_BY_ORGANIZATION` — no hay ningún recurso más allá de refugios (que ya tienen su propia sección, no una relación de crisis separada en este pase, para no duplicar la misma información en dos formas distintas).
- **Limitación**: documentada explícitamente en `organizations.reason` y en `limitations[]`.

---

## 8. Modelo de relaciones

- **Entidades**: `INCIDENT`, `TERRITORY`, `INFRASTRUCTURE` — el subconjunto de la lista del mandato (§20) que este pase puede poblar con datos reales. `ORGANIZATION`/`RESOURCE`/`ACTION`/`DECISION`/`REPORT`/`HELP_REQUEST`/`ROUTE`/`SHELTER`/`MEDICAL_FACILITY`/`SERVICE` no participan en ninguna relación emitida en este pase — no porque el modelo no los soporte, sino porque no hay una fuente real que produzca esas relaciones sin inventar datos.
- **Tipos**: `LOCATED_IN`, `AFFECTS`, `CORRELATED_WITH` — subconjunto acotado del vocabulario del mandato (§21), cada uno con semántica documentada en `src/types/territorialDossier.ts`.
- **Estados**: `OBSERVED`/`CALCULATED`/`DECLARED` (Prompt 7 §22) — **todas las relaciones emitidas en este pase son `CALCULATED`** (resultado determinista de una operación geométrica/de consulta real). Ninguna es `OBSERVED` (no hay fuente que declare relaciones explícitas) ni `DECLARED` (no se implementó creación manual de relaciones por operador en este pase — ver deuda).
- **Confianza**: por relación, 0-100, siempre independiente de `incident.confidence` — probado explícitamente (§20): un incidente `verified` no produce una relación `CORRELATED_WITH` con confianza 100.
- **Persistencia**: ninguna — todas las relaciones se calculan en cada solicitud, nunca se guardan (ver §16, decisión explícita).
- **Auditoría**: no aplica en este pase — sin relaciones `DECLARED` (manuales), no hay nada que auditar todavía por parte de un operador.

---

## 9. Relaciones implementadas

| Origen | Relación | Destino | Método | Persistencia | Confianza |
|---|---|---|---|---|---|
| `INCIDENT` | `LOCATED_IN` | `TERRITORY` (nombre de área administrativa real) | Punto-en-polígono contra la geometría administrativa real del incidente (`argusGeometryResolver`, ya resuelta) | No persistida | 90 (geometría real) |
| `INCIDENT` | `AFFECTS` | `INFRASTRUCTURE` (activo `INSIDE`/`BORDER` del análisis de impacto) | Reutiliza la clasificación espacial ya calculada por `buildIncidentImpactAssessment` (Prompt 6) — nunca recalculada | No persistida | 85 (`INSIDE`) / 60 (`BORDER`) |
| `INCIDENT` | `CORRELATED_WITH` | `INCIDENT` (otro incidente activo con el mismo `regionCode`) | Filtro por `regionCode` vía `fetchCanonicalModuleIncidents` — **nunca** `CAUSED_BY`, ninguna inferencia de causalidad por proximidad temporal | No persistida | 35 (señal débil, deliberadamente baja) |

---

## 10. Relaciones entre incidentes

- **Duplicados/actualizaciones**: no implementado — no hay una fuente real de dedup a nivel de incidente canónico conectada a este expediente (el motor real de dedup, `deduplicateEvents.ts`, opera sobre feeds crudos antes de llegar a `KnowledgeIncident`, capa distinta).
- **Correlación**: implementada como `CORRELATED_WITH`, exclusivamente por territorio compartido (§9) — deliberadamente la señal más débil y honesta disponible, nunca presentada como causalidad.
- **Causalidad**: **no implementada, a propósito** — el mandato (§24) prohíbe explícitamente inferir `CAUSED_BY` por proximidad, y no existe en el repo ninguna fuente real de causalidad declarada (p.ej. una alerta oficial que explícitamente declare "sismo causó deslizamiento"). Inventar esa relación habría violado la regla central del mandato.
- **Incidentes secundarios**: no implementado, mismo motivo.
- **Conflictos**: no implementado en este pase — no hay dos fuentes de evidencia comparadas por incidente en el expediente (ver §11).

---

## 11. Evidencia y contradicciones

**No implementado en este pase.** `KnowledgeEvidence` (Prisma) es real y conectado, pero está semánticamente acoplado a "evidencia de un `KnowledgeIncident`" en sus ~15 consumidores existentes (`incidentId` es un `String?` suelto, sin `@relation`, pero cada consumidor asume ese significado exacto). Repropósitarlo para "evidencia de una relación de crisis" sin auditar los 15 consumidores habría sido un cambio de alto riesgo fuera de proporción para este pase — documentado como deuda (P2), no forzado. `CrisisRelationSummary` (`src/types/territorialDossier.ts`) deliberadamente **no** declara un campo `evidenceIds`: agregarlo sin conectarlo a una fuente real habría sugerido una capacidad de evidencia que no existe todavía, en vez de simplemente omitir el campo hasta que haya algo real que poblarlo.

---

## 12. Integración con impacto

- **Infraestructura**: `dossier.infrastructure` es un passthrough literal de `impact.infrastructure.assets` — mismo dato, mismo objeto, sin transformación adicional más allá de envolver en `DossierSection`.
- **Población**: `dossier.population` es un passthrough literal de `impact.population.reason` — mismo `NOT_AVAILABLE`, misma razón exacta.
- **Rutas**: no incluidas en el expediente en este pase — `impact.routes` ya es `NOT_AVAILABLE` en el Prompt 6 (sin registro de rutas por área); no había nada real que componer.
- **Servicios/dependencias**: mismo caso — `impact.services` es `NOT_AVAILABLE`, no se agregó al expediente una sección separada que solo repetiría la misma ausencia.
- **Freshness**: `impact` se recalcula en cada solicitud del expediente (mismo `now` inyectado) — no hay desincronización posible entre lo que el expediente muestra y lo que el endpoint de impacto mostraría para el mismo incidente en el mismo instante.

---

## 13. Integración con módulos

| Módulo | Antes | Después | Estado |
|---|---|---|---|
| VIGÍA (detalle de incidente) | Impacto (Prompt 6) + refugios + telecom | + expediente territorial (`TerritorialDossierSection.tsx`) | **Integrado** |
| Mapa (2D/Orbit) | No consumía expediente | Sin cambios | No integrado — el mapa no requiere este dato para renderizar; la identidad territorial ya deriva de la misma geometría que el mapa ya usa |
| AURA | Datos demo (`auraDemoMedicalPoints`) | Sin cambios | No integrado — fuera de alcance, mismo motivo que el Prompt 6 |
| FÉNIX | Simulador manual desconectado | Sin cambios | No integrado — mismo motivo que el Prompt 6 |
| Command Center | Sistema legacy, tipo de incidente distinto | Sin cambios | **Explícitamente no integrado** — ver §2, integrarlo requiere primero migrar el propio Command Center al incidente canónico |
| ATLAS/ORÁCULO/TALOS | N/A | El endpoint acepta los 4 `moduleId`, UI conectada solo en VIGÍA | Backend listo para los 4, deuda de UI menor (mismo patrón que el Prompt 6) |

---

## 14. Panel y visualización

- **Secciones**: estado del expediente, áreas administrativas, conteo de incidentes relacionados/refugios, lista de incidentes relacionados (máx. 5 mostrados), lista de relaciones (máx. 8 mostradas), limitaciones (colapsable).
- **Selección**: no se implementó selección interactiva de territorio/nodo en este pase — la sección es de solo lectura, coherente con el alcance de "panel de incidente", no un explorador de grafo independiente.
- **Relaciones visuales**: **no se implementó ninguna visualización de grafo** — el mandato (§34) exige que una vista de grafo solo se construya si existen relaciones reales, aporta función operacional y no satura; con 3 tipos de relación y un máximo típico de una decena de relaciones por incidente, una lista de texto con etiqueta+confianza ya es legible y operacionalmente útil sin la complejidad/riesgo de una librería de grafo nueva. Documentado como decisión explícita, no una omisión.
- **Filtros/expansión**: no aplica sin vista de grafo.
- **Límites**: `RELATED_INCIDENTS_RADIUS_LIMIT = 10` (incidentes relacionados), 8 relaciones mostradas en UI — nunca una lista sin límite.
- **Rendimiento**: la sección UI usa el mismo patrón de fetch-con-cancelación (`AbortSignal.timeout`, `cancelled` flag) que `IncidentShelterOperationalSection`/`IncidentImpactSection` ya establecido.

---

## 15. Seguridad y privacidad

- **DTO público**: no existe — el endpoint completo es operador-only en este pase (mismo criterio conservador que el Prompt 6).
- **Datos operacionales**: `requireOperator()` + el control de acceso por módulo de `getModuleIncidentDetailContext` — dos capas del mismo sistema RBAC existente, ninguno nuevo.
- **Infraestructura sensible**: heredada tal cual del análisis de impacto (ya sin datos privados, Prompt 6 §14).
- **Report/HelpRequest**: el expediente **nunca** los toca — ni directa ni indirectamente (no se agregó ninguna consulta nueva contra esos modelos).
- **Caché**: ninguna — no hay riesgo de filtración entre audiencias porque no hay caché.
- **RBAC**: reutilizado tal cual (`requireOperator`), sin ningún sistema de permisos nuevo.

---

## 16. Persistencia y Prisma

| Modelo o campo | Cambio | Compatibilidad | Migración |
|---|---|---|---|
| — | Ninguno | N/A | **Ninguna migración creada ni ejecutada** |

**Decisión explícita de no tocar Prisma**, por las mismas razones ya documentadas en el Prompt 3 (`ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md` §7 — base de datos de desarrollo compartida con producción, sin entorno aislado) y el Prompt 6 (`ARGUS_IMPACT_ASSESSMENT_IMPLEMENTATION.md` §16). Toda relación/identidad territorial se calcula en tiempo real a partir de datos ya persistidos por otros sistemas (incidente canónico, `CriticalPoi`, refugios) — ninguna escritura nueva. `ExternalEventCorrelation` (huérfano, §2) tampoco fue tocado ni reutilizado — repropósitarlo sin migración habría requerido cambiar su forma de todos modos.

---

## 17. Datos demo

| Dato | Ubicación | Estado anterior | Estado final |
|---|---|---|---|
| `arcaDemoShelters`/`auraDemoMedicalPoints` | `src/modules/{arca,aura}/data.ts` | Sin gating, ya documentado como demo en Prompt 6 | **No tocado, no conectado al expediente** — se usó `getRealFenixShelters` (real) en su lugar |
| Nuevo: `TerritorialDossier.isDemo` | `src/types/territorialDossier.ts` | — | Propagado directamente de `ModuleIncidentSummary.isDemo`, nunca recalculado — mismo patrón que `IncidentImpactAssessment.isDemo` (Prompt 6) |

---

## 18. Archivos modificados

| Archivo | Cambio | Motivo |
|---|---|---|
| [rateLimitPolicy.ts](src/lib/security/rateLimitPolicy.ts) | + política `territorial_dossier_read` | Reutiliza el sistema de rate limiting existente |
| [VigiaCanonicalIncidentDetail.tsx](src/modules/vigia/components/VigiaCanonicalIncidentDetail.tsx) | + `<TerritorialDossierSection>` junto a `<IncidentImpactSection>` | Integra el expediente dentro del detalle de incidente ya existente |

---

## 19. Archivos nuevos

| Archivo | Contenido | Motivo |
|---|---|---|
| [territorialDossier.ts](src/types/territorialDossier.ts) | Contrato `TerritorialDossier`, `TerritorialIdentity`, `CrisisRelationSummary` | Proyección compuesta — nunca un segundo modelo de incidente/territorio |
| [territorialIdentityResolver.ts](src/lib/territory/territorialIdentityResolver.ts) | `resolveTerritorialIdentity()` | Resolución territorial honesta, sin inventar nivel administrativo |
| [territorialDossier.ts](src/lib/territory/territorialDossier.ts) | `buildTerritorialDossier()` + sub-constructores | Composición real sobre capacidades ya existentes |
| [route.ts](src/app/api/modules/incidents/[id]/dossier/route.ts) | `GET /api/modules/incidents/[id]/dossier` | Misma identidad de incidente que los endpoints ya existentes |
| [TerritorialDossierSection.tsx](src/components/modules/TerritorialDossierSection.tsx) | Sección UI, mismo patrón que `IncidentImpactSection.tsx` | Consumidor real dentro del panel de incidente |
| [tests/territory/territorialDossier.test.ts](tests/territory/territorialDossier.test.ts) | 15 casos | Ver §20 |

---

## 20. Pruebas ejecutadas

| Comando | Resultado | Observaciones |
|---|---|---|
| `npx tsc --noEmit` | 1 error preexistente, no relacionado | Mismo error ya documentado en los informes de Prompt 5/6 (`senapredSingleOwner.test.ts:52`) |
| `npx eslint .` (archivos de esta tarea) | 0 errores, 1 warning preexistente-en-patrón | `TerritorialDossierSection.tsx` reproduce el mismo warning `react-hooks/set-state-in-effect` que sus dos plantillas (`IncidentShelterOperationalSection.tsx`, `IncidentImpactSection.tsx`) — no es una regresión nueva |
| `npx vitest run` | 1167/1167 pruebas pasan (113/115 archivos) | Mismos 2 archivos preexistentes (`tests/p0/codigo-azul-*`) fallan por el bug de hoisting ya documentado |
| `npx vitest run tests/territory` | 15/15 pruebas nuevas pasan | Cobertura: resolución territorial (geometría real, fallback canónico, sin fabricar), incidentes relacionados (filtro por región, exclusión del origen, orden por severidad+recencia, `NOT_APPLICABLE` sin región), relaciones (`LOCATED_IN` por cada área intersectada, `AFFECTS` solo `INSIDE`/`BORDER` nunca `NEAR`, `CORRELATED_WITH` nunca `CAUSED_BY` con confianza baja e independiente), organizaciones/riesgos históricos siempre `UNAVAILABLE` con razón, población passthrough sin recalcular, refugios reutilizando la fuente real, `overallStatus` nunca `COMPLETE` mientras falten fuentes reales, `isDemo` propagado, reloj inyectable |
| `npm run build` | Build exitoso (Next.js 16.2.9, Turbopack) | `/api/modules/incidents/[id]/dossier` registrada correctamente |

---

## 21. Rendimiento

| Escenario | Entidades | Relaciones | Tiempo | Resultado |
|---|---|---|---|---|
| No medido en navegador/entorno real | — | — | No medido | Misma limitación de entorno ya documentada en los Prompts 5 y 6 (sin servidor de previsualización disponible en esta sesión) |

**Análisis por inspección de código**: el expediente ejecuta, por solicitud: 1 llamada a `buildIncidentImpactAssessment` (que a su vez ejecuta 1 consulta `CriticalPoi`, mismo costo ya documentado en el Prompt 6), 1 consulta `fetchCanonicalModuleIncidents` (ya usada en producción por los dashboards de módulo, mismo perfil de costo), y 1 consulta `getRealFenixShelters` (ya usada en producción). Las dos últimas se ejecutan en paralelo (`Promise.all`). No hay operación adicional de red o CPU pesada más allá de las tres ya-en-producción reutilizadas — el costo marginal de este pase es composición pura en memoria (filtrado, ordenamiento, construcción de relaciones), O(n) sobre resultados ya acotados por límite. El rate limit (20/60s por operador, más estricto que el de impacto porque compone tres fuentes en vez de una) acota el peor caso. Escalar a los volúmenes del mandato (10 territorios/1.000 incidentes/10.000 relaciones) requeriría medición real — documentado como deuda P3, mismo criterio que en los Prompts 5/6.

---

## 22. Riesgos residuales

- **P0**: ninguno detectado en el alcance de este prompt.
- **P1**: (a) sin persistencia de relaciones — nada es auditable más allá del log HTTP; (b) sin directorio de organizaciones/autoridades ni de riesgos históricos — ambas secciones permanecen `UNAVAILABLE` indefinidamente sin una fuente real que conectar; (c) AURA/FÉNIX no consumen este expediente.
- **P2**: (a) sin evidencia vinculable a relaciones (`KnowledgeEvidence` no repropósitado, ver §11); (b) sin reverse geocoding (ningún gap crítico bloqueado por esto en este pase, pero limita la resolución territorial cuando el incidente solo tiene coordenadas sin `regionCode`); (c) UI del expediente solo conectada en VIGÍA.
- **P3**: sin benchmark de rendimiento real (misma limitación de entorno).

---

## 23. Deuda pendiente

| Deuda | Prioridad | Dependencia | Criterio de cierre |
|---|---|---|---|
| Sin persistencia de relaciones/decisiones | P1 | Migración aditiva a Prisma (posiblemente repropositando `ExternalEventCorrelation` o extendiendo `AuditLog`) + decisión de qué relaciones ameritan historial auditable | Relación `DECLARED` (manual) persistida con actor/rol/razón/timestamp, nunca sobrescrita silenciosamente |
| Sin directorio de organizaciones/autoridades | P1 | Fuente real (dataset oficial de contactos de protección civil/bomberos/policía por país) — no inventar | `organizations.status` pasa a `AVAILABLE` solo cuando existe una fuente validada, nunca antes |
| Sin riesgos históricos | P1 | Filtrar `KnowledgeIncident` por lifecycle resuelto + ventana histórica, clasificando `HISTORICAL`/`SEASONAL`/`STRUCTURAL` | `historicalRisks.status` pasa a `AVAILABLE` con incidentes reales, nunca frecuencia presentada como certeza futura |
| AURA/FÉNIX no consumen el expediente | P1/P2 | Trabajo dedicado de cada módulo (fuera de alcance) | Cada módulo deja de mantener su propio expediente/datos demo y consulta este servicio |
| Evidencia no vinculable a relaciones | P2 | Auditoría de los ~15 consumidores de `KnowledgeEvidence` antes de repropositarlo, o una tabla de evidencia-de-relación nueva | `CrisisRelationSummary` gana `evidenceIds` real, sin romper ningún consumidor existente de `KnowledgeEvidence` |
| Sin reverse geocoding | P2 | Decisión de producto sobre proveedor (respetando SSRF guard existente) | Territorio resoluble desde solo coordenadas cuando no hay `regionCode`/geometría de área |
| UI solo conectada en VIGÍA | P2 | Ninguna — trabajo mecánico | `TerritorialDossierSection` añadido a ATLAS/ORÁCULO/TALOS |
| Sin benchmark de rendimiento real | P3 | Entorno con navegador/base de datos poblada | Medir con los escenarios del mandato (1/10/100 territorios × 10-10.000 incidentes/relaciones) |

---

## 24. Preparación para el próximo bloque

Para **Prompt 8 — Síntesis operacional y briefing ARGUS**:

- `TerritorialDossier` ya expone un contrato compacto (`territory`, `relatedIncidents`, `infrastructure`, `shelters`, `population`, `organizations`, `historicalRisks`, `relationships`, `limitations`, `freshness` vía `overallStatus`) — exactamente la forma que el mandato del Prompt 8 (§48 del Prompt 7 anterior) pedía preparar, sin implementar todavía ninguna síntesis de texto libre ni LLM.
- `CrisisRelationSummary` ya declara `methodology`/`confidence` por relación — reutilizable directamente si un futuro briefing determinista necesita explicar "por qué" sin generar texto libre.
- La deuda de organizaciones/riesgos históricos (§23) es directamente relevante para un briefing completo — vale la pena cerrarla antes o junto con ese bloque en vez de que el briefing la duplique con su propia fuente.

No se implementó ninguna síntesis con LLM, ni ningún texto de briefing libre, en esta entrega.

---

## 25. Estado Git

- **Rama**: `phase-3-ui-ux` (sin cambios de rama).
- **Cambios previos** (ya presentes al iniciar esta tarea, no tocados): todo el trabajo de los Prompts 3-6 ya presente (canónico, consolidación de fuentes, mapa, impacto), más el trabajo del usuario ajeno a esta serie (`docs/PUBLIC_CHANGELOG.md`/`publicChangelog.json`, staged) — verificado íntegro.
- **Cambios de esta tarea**:
  - Modificados: `src/lib/security/rateLimitPolicy.ts`, `src/modules/vigia/components/VigiaCanonicalIncidentDetail.tsx`.
  - Nuevos: `src/types/territorialDossier.ts`, `src/lib/territory/territorialIdentityResolver.ts`, `src/lib/territory/territorialDossier.ts`, `src/app/api/modules/incidents/[id]/dossier/route.ts`, `src/components/modules/TerritorialDossierSection.tsx`, `tests/territory/territorialDossier.test.ts`, este documento.
- **Migraciones creadas**: ninguna.
- **Archivos eliminados**: ninguno.
- **Confirmación**: no se ejecutó `git reset`, `git checkout .`, `git restore .`, `git clean` ni `git stash`; no se revirtió ningún trabajo previo.

---

## 26. Confirmación final

- No se realizó commit.
- No se realizó push.
- No se realizó deploy.
- No se modificaron secretos.
- No se ejecutaron migraciones (destructivas ni de ningún tipo — `prisma/schema.prisma` no se tocó).
- No se actualizó el changelog público.
- No se cambió la versión pública de ARGUS.
- No se implementó IA generativa.
- No se creó otro mapa.
- No se creó un sistema territorial paralelo — el expediente compone datos de sistemas ya existentes, sin copiarlos ni desincronizarlos.
- No se adoptó ninguna base de grafos externa (Neo4j/ArangoDB/JanusGraph/Neptune) — todo se calcula en tiempo real sobre PostgreSQL/Prisma ya existente.
- No se incorporó `stealthFetch`.
- No se incorporaron cámaras ni escáneres de OSIRIS.
