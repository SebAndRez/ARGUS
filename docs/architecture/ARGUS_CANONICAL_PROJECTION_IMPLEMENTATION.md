# ARGUS — Implementación del Mapeador Canónico `KnowledgeIncident → ArgusEvent`

**Fecha**: 2026-07-14
**Tipo**: implementación técnica — primera fase aprobada por el diseño del Prompt 8.
**Alcance**: no se modificó `prisma/schema.prisma`, no se crearon migraciones, no se movieron datos, no se conectaron `Report`/`HelpRequest` ni módulos verticales, no se hizo commit ni push.
**Documentos que preceden y gobiernan esta implementación**: `ARGUS_CANONICAL_INCIDENT_DESIGN.md`, `ARGUS_CANONICAL_INCIDENT_DIAGRAMS.md`, `ARGUS_INCIDENT_MIGRATION_PLAN.md`, `ARGUS_INCIDENT_FIELD_MAPPING.md`.

---

## 1. Decisión arquitectónica heredada del Prompt 8 (confirmación)

Antes de tocar código se releyeron los cuatro documentos de arquitectura. Confirmación explícita de cada punto requerido:

| Pregunta | Decisión confirmada | Fuente |
|---|---|---|
| Alternativa aprobada | **Alternativa A** — evolucionar `KnowledgeIncident` hacia `Incident`, usando una capa canónica de lectura (técnicas de la Alternativa C) como puente en las Fases A–B, sin tocar el esquema todavía | `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §4 |
| Papel futuro de `KnowledgeIncident` | Evoluciona (no se reemplaza); en esta fase permanece como está en Prisma — solo cambia cómo se *lee* | `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §21.1 |
| Papel de `ArgusEvent` | Se mantiene como DTO/proyección de presentación, nunca se convierte en tabla | `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §21.2, §14 |
| Lifecycle canónico recomendado | 11 estados (`DETECTED…ARCHIVED/REJECTED/DUPLICATE`) como destino final; en esta fase solo se unifica la *proyección* hacia `ArgusEvent.status`, no el lifecycle persistido | `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §8 |
| Severidad canónica recomendada | `INFO/LOW/MODERATE/HIGH/CRITICAL` como destino final de `Incident.effectiveSeverity`; en esta fase la salida sigue siendo el contrato ya existente `ArgusSeverity` (`info/low/medium/high/critical`) porque `ArgusEvent` no cambia de forma | `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §9, §14 |
| Primer cambio técnico aprobado | El mapeador único `canonicalKnowledgeIncidentToArgusEvent()`, leyendo temporalmente desde `KnowledgeIncident`, sin migración — exactamente esta tarea | `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §21.12; `ARGUS_INCIDENT_MIGRATION_PLAN.md` Fase A |

Los cuatro documentos existían, estaban completos y contenían una decisión explícita para cada punto — no fue necesario detener la tarea ni improvisar arquitectura.

---

## 2. Reconocimiento de consumidores (antes de tocar nada)

Se buscó `vigiaIncidentToArgusEvent`, `knowledgeIncidentToArgusEvent`, `ArgusEvent`, `KnowledgeIncident`, `mapKnowledgeIncident`, `incidentToArgusEvent` en todo el repositorio (imports directos, reexports, dinámicos, tests, endpoints, módulos, scripts, documentación).

| Consumidor | Mapeador actual (antes) | Uso | Respuesta pública | Riesgo de cambio |
|---|---|---|---|---|
| `src/app/api/vigia/events/route.ts` | `vigiaIncidentToArgusEvent` | Mapea incidentes Global Watch (todas las fuentes salvo SENAPRED) a `ArgusEvent` para el mapa | Sí — `GET /api/vigia/events` | Medio — endpoint público usado por el mapa 2D/Orbit 3D |
| `src/app/api/chile-alerts/route.ts` | `knowledgeIncidentToArgusEvent` | Mapea alertas SENAPRED promovidas a `ArgusEvent` | Sí — `GET /api/chile-alerts` | Medio — mismo consumidor visual |
| `src/lib/vigia/vigiaIncidentToArgusEvent.ts` | (definición) | — | No es endpoint | Bajo — un solo import real (arriba) |
| `src/lib/knowledge-intake/map/knowledgeIncidentToArgusEvent.ts` | (definición) | — | No es endpoint | Bajo — un solo import real (arriba) |
| `scripts/repairGdacsGreenSeverity.ts` | Mención en comentario únicamente | Backfill de severidad GDACS, no importa el mapeador | No | Ninguno — no es un import real |
| `src/lib/incidents/alertPromotionEngine.ts` | Mención en comentario únicamente | Comentario explicando que `technicalFactorsJson` sobrevive para que el mapeador lo lea | No | Ninguno — no es un import real |
| `src/lib/vigia/gdacsSeverity.ts` | Mención en comentario únicamente (docstring) | Explica quién consume `canonicalizeGdacsSeverity` | No | Ninguno — no es un import real |
| `src/app/api/argus/events/route.ts` | **Ninguno** | Construye `ArgusEvent` directamente desde `correlateSignals()` sobre señales SENAPRED en vivo — nunca importó ninguno de los dos mapeadores de `KnowledgeIncident` | Sí — `GET /api/argus/events` | **Fuera de alcance de esta tarea**: no es consumidor de los dos mapeadores duplicados que el Prompt 9 pide unificar; es un tercer sitio de construcción ya identificado en el diseño del Prompt 8 (§14) para una fase posterior |

No se encontraron imports dinámicos, reexports, ni referencias en módulos verticales o componentes de UI. No se eliminó ningún mapeador antes de confirmar esta lista completa.

**Nota sobre `/api/argus/events`**: aunque el Prompt 9 pide revisar los tres endpoints por coherencia, este endpoint no consume `KnowledgeIncident` en absoluto (usa señales SENAPRED en vivo, sin persistencia) — no hay un mismo `KnowledgeIncident` que comparar entre este endpoint y los otros dos. Se deja fuera de esta migración, tal como exige el alcance estricto del Prompt 9 (no modificar fuentes, no modificar el adaptador SENAPRED en vivo).

---

## 3. Comparación campo por campo (mapeadores legacy)

| Campo `ArgusEvent` | Mapeador VIGÍA (antes) | Mapeador Knowledge Intake / Chile (antes) | Diferencia | Regla canónica aplicada |
|---|---|---|---|---|
| `id` | `vigia-${id}` | `chile-alert-${id}` | Prefijo distinto | Se preserva cada prefijo vía `options.idPrefix` (parámetro explícito, no detección oculta de familia) — cero cambio de IDs públicos |
| `eventType` | `threatToArgusEventType(classifyGlobalThreat(...))` | Tabla plana `DOMAIN_TO_EVENT_TYPE` | Dos clasificadores de amenaza distintos | Se unifica en `classifyGlobalThreat` + `threatToArgusEventType` para ambas familias (cubre correctamente los dominios de Chile, ya presentes en `DOMAIN_TO_THREAT`) |
| `severity` | `mapSeverity` + `canonicalizeGdacsSeverity` | `mapSeverity` (idéntico, sin GDACS) | Cuerpos de `mapSeverity` idénticos; solo VIGÍA canonicalizaba GDACS | `canonicalizeGdacsSeverity` se invoca siempre (es no-op determinista para no-GDACS) — una sola regla para cualquier fuente |
| `status` | `LIFECYCLE_TO_STATUS[technicalFactors.lifecycle ?? "active"]` | `statusFromLifecycle(tags, mapStatus(severity))` (lee tags `lifecycle:*`) | Vocabularios distintos (campo vs. tag) | `mapCanonicalLifecycleToArgusStatus()`: tag `lifecycle:cancelled` gana siempre; si no, campo `technicalFactors.lifecycle` (vocabulario `IncidentLifecycle`, compartido de hecho por ambos productores); si no hay señal, fallback por severidad — ver §5 |
| `title` | Sufijo `(No confirmado)` si `no-confirmado` en tags | Sin sufijo (Chile nunca tiene ese tag) | Regla idéntica, solo que nunca se dispara en Chile | Unificada: se aplica el mismo chequeo de tag a cualquier familia (Chile sigue sin verse afectado, nunca tiene esa tag) |
| `country`/`region`/`province`/`commune` | `country ?? "—"`, `region`, sin `province`, `commune = locality` | `country ?? "CL"`, lee `technicalFactors.{region,province,commune}` | Chile usa JSON técnico; VIGÍA usa columnas | Se unifica: `region` = columna (equivalente en la práctica, Chile escribe el mismo valor en ambos lugares), `province`/`commune` = JSON técnico con fallback a `locality` — ver §11 |
| `geometry`/`geometryPrecision` | Siempre `point` desde lat/lng | Lee `geometryJson.administrative_area` si existe, si no `point` | Chile tiene geometría real; VIGÍA nunca la leía | Se unifica: cualquier incidente con `geometryJson` válido de tipo `administrative_area` la usa; si no, `point` — ver §6 |
| `sources`/`source` | `sourceTypeFor(sourceId)` (registry) | Hardcodeado `"official"` | Chile ignoraba el registry | Se unifica en `sourceTypeFor()` para ambas — no cambia el resultado real para SENAPRED (`senapred_eventos.isOfficial === true` en el registry) |
| `confidence` | `mapConfidence(confidenceScore, unconfirmed)` | Hardcodeado `"high"` | Chile ignoraba `confidenceScore` real | Se unifica en `mapConfidence()` — ver §12, cambio de comportamiento documentado |
| `startedAt` (`validFrom`) | `occurredAt` | `occurredAt` | Igual | Sin cambio |
| `updatedAt` (`lastUpdated`) | `updatedAt` | `updatedAt` | Igual | Sin cambio, con fallback seguro ante fecha inválida (`createdAt`, luego época Unix) |
| `expiresAt` (`validUntil`) | No se producía | No se producía | Igual (ninguno lo hacía) | Sin cambio — `validUntil` sigue sin poblarse en esta fase (es una adición de Fase C, fuera de alcance) |
| `isOfficial` | No existe como campo en `ArgusEvent`; se expresa vía `sourceType === "official"` | Igual | — | Se documenta la equivalencia; no se inventa un campo nuevo (no cambia la estructura pública) |
| `isDemo` | `tags.includes("seed")` | `tags.includes("seed")` (idéntico) | Ninguna | Se reemplaza por `isDemoLikeSource()` (helper centralizado, `demoDataGuard.ts`) — estrictamente más protector, nunca menos — ver §7 |

---

## 4. Contrato canónico de entrada

```ts
export type CanonicalKnowledgeIncidentInput = {
  id: string;
  externalId: string | null;
  sourceId: string;
  sourceName: string;
  domain: string;
  subtype: string | null;
  title: string;
  summary: string;
  severity: string;
  confidenceScore: number;
  country: string | null;
  region: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  geometryJson: unknown;
  technicalFactorsJson: unknown;
  impactJson: unknown;
  casualtiesJson: unknown;
  recommendedActionsJson: unknown;
  rawEvidenceRefsJson: unknown;
  tagsJson: unknown;
  occurredAt: Date | string | null;
  detectedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};
```

Justificación: es el subconjunto exacto de campos que ambos mapeadores legacy leían (unión, no la fila Prisma completa — se omiten `actionabilityScore`, `sourceReliabilityScore`, `causesJson`, `contributingFactorsJson`, `responseActionsJson`, `lessonsLearnedJson`, `relatedHistoricalEventsJson`, `similarIncidentIdsJson`, `language`, `reviewStatus`, que ninguno de los dos mapeadores usaba). Una fila real de `prisma.knowledgeIncident` satisface esta forma estructuralmente sin ningún adaptador — se pasa directo. Esto permite testear con fixtures planos, sin Prisma, sin red, sin cookies.

`CanonicalProjectionOptions.idPrefix` es el único parámetro adicional — preserva los IDs públicos históricos por endpoint sin que el mapeador necesite detectar la familia del incidente.

---

## 5. Reglas unificadas

### Severidad
Una sola función (`resolveEffectiveSeverity`) invoca `canonicalizeGdacsSeverity` incondicionalmente (no-op garantizado para no-GDACS por su propia guarda `isGdacsSource`) y luego `normalizeArgusSeverity`, que solo acepta `critical/high/medium/low` — cualquier otro valor (incluida ausencia) cae a `"medium"`, nunca a `"critical"`. Comportamiento fail-safe idéntico al que ya tenían ambos mapeadores legacy para su propio fallback, ahora en un solo lugar.

### Lifecycle / estado
`mapCanonicalLifecycleToArgusStatus()`: (1) tag `lifecycle:cancelled` → `resolved`, siempre gana; (2) si no, campo `technicalFactors.lifecycle` con un valor reconocido (`new/active/monitoring/contained/resolved/archived`) → mapeo directo; (3) si no hay ninguna señal → fallback por severidad (`critical→active`, `high→risk`, resto→`monitoring`), nunca "activo" por defecto.

**Divergencias intencionales frente al comportamiento anterior, documentadas y justificadas** (verificadas contra `src/lib/incidents/alertPromotionEngine.ts:46-61`, no supuestas):
1. `chileAlertLifecycle()` ya escribe **tanto** el tag (`lifecycle:cancelled|modified|maintained|declared|active`) **como** el campo `technicalFactors.lifecycle` con el vocabulario compartido `IncidentLifecycle` (`resolved/monitoring/active`) — el mapeador Chile legacy nunca leía ese campo, solo el tag, y el tag por defecto (`lifecycle:active`, la rama "sin palabra clave detectada") no coincidía con ninguno de los cuatro casos que `statusFromLifecycle` reconocía, así que cualquier alerta chilena recién declarada (sin cancelación/modificación/mantención/declaración explícita en el texto) caía al fallback por severidad (`mapStatus`: alta→`"risk"`). Con la regla unificada, esa misma alerta ahora resuelve correctamente vía el campo a `"active"` — una corrección, no una regresión, y consistente con el propio comentario del código fuente ("...so the extra fields survive for [el mapeador] to read back").
2. Un incidente VIGÍA sin `technicalFactors.lifecycle` todavía (ventana breve antes del primer sweep de Global Watch) antes caía siempre a `"active"`; ahora cae al fallback por severidad, evitando mostrar como activo algo que aún no fue confirmado con esa fuerza — más alineado con "no inventar confirmación" (Prompt 9 §9).

### Geometría
Una sola función (`resolveCanonicalGeometry`): confía en `geometryJson` únicamente cuando su forma calza exactamente con `administrative_area` (tipo, `geojson.type` es `Polygon`/`MultiPolygon` con coordenadas no vacías, `anchor` es una tupla finita) — cualquier otra forma, incluido un bbox mal etiquetado, se descarta estructuralmente y cae al fallback de punto (solo con lat/lng finitos). Nunca se fabrica un polígono desde un bbox porque el contrato de tipos (`ArgusGeometry`) no tiene una variante bbox — es estructuralmente imposible, no solo una convención de código.

### Fuente / trazabilidad
`sourceTypeFor(sourceId)` (antes solo en VIGÍA) se aplica ahora también a Chile — sin cambio de resultado real, porque `senapred_eventos` ya está marcado `isOfficial: true` en `VIGIA_SOURCE_REGISTRY`.

### Confianza
`mapConfidence(confidenceScore, unconfirmed)` (antes solo en VIGÍA) reemplaza el hardcodeo `"high"` de Chile. **Cambio de comportamiento real y documentado**: SENAPRED promueve incidentes con `confidenceScore: 90` (verificado en `alertPromotionEngine.ts:152`), que bajo la fórmula unificada produce `"verified"` (umbral `>= 90`) en vez del `"high"` fijo anterior — una convergencia deliberadamente aprobada por el diseño (`ARGUS_CANONICAL_INCIDENT_DESIGN.md` §14, hallazgo explícito sobre el hardcodeo de Chile como inconsistencia a corregir), no un efecto colateral no examinado.

### Demo
`isDemoLikeSource()` (helper centralizado de `demoDataGuard.ts`) reemplaza `tags.includes("seed")` — estrictamente más protector (el helper cubre la señal `"seed"` estructural y además placeholder/demo/mock/synthetic/simulated/fallback en campos estructurales y, con el patrón de dos niveles ya validado del propio helper, también en texto libre). Es una función pura (no lee `process.env`), preservando el requisito de que el mapeador no dependa de estado global. Regla nueva y explícita: si el contenido se detecta como demo, `sourceType` nunca resuelve a `"official"` (se degrada a `"model_context"`) — regla estructural, no gateada por entorno, distinta de `shouldHideDemoDataInProduction()` (que sí depende de `process.env` y por eso nunca se invoca desde este módulo).

### Fechas
`toIso()`/`toDate()` aceptan `Date` u `string`, nunca lanzan sobre una fecha inválida (retornan `undefined`, con fallback en cascada: `detectedAt → occurredAt → createdAt`, `lastUpdated → updatedAt → createdAt → época Unix`). Toda serialización usa `toISOString()`, siempre UTC, sin dependencia de la zona horaria del proceso.

---

## 6. Endpoints migrados

| Endpoint | Mapeador anterior | Mapeador actual | Filtros propios preservados |
|---|---|---|---|
| `GET /api/vigia/events` | `vigiaIncidentToArgusEvent` (import directo) | `canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "vigia" })` | `?severity=`, `?threat=`, `?days=`, `?limit=`, exclusión de `status === "archived"`, exclusión de demo salvo `?includeDemo=true` — todos fuera del mapeador, aplicados como `.filter()` posteriores en la ruta, sin cambio |
| `GET /api/chile-alerts` | `knowledgeIncidentToArgusEvent` (import directo) | `canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "chile-alert" })` | `sourceId: "senapred_eventos"` (en `getKnowledgeIncidents`), `?severity=`, `?limit=`, exclusión de demo salvo `?includeDemo=true` — sin cambio |
| `GET /api/argus/events` | Ninguno (no consumía estos mapeadores) | Sin cambio — fuera de alcance (§2) | No aplica |

La regla aplicada en ambos endpoints migrados es exactamente `proyección común + filtro específico del endpoint` (Prompt 9 §14) — nunca un mapeo distinto por endpoint.

---

## 7. Wrappers legacy

`src/lib/vigia/vigiaIncidentToArgusEvent.ts` y `src/lib/knowledge-intake/map/knowledgeIncidentToArgusEvent.ts` se conservan como delegaciones puras de una sola línea, marcadas `@deprecated`, sin lógica propia:

```ts
export function vigiaIncidentToArgusEvent(incident: PersistedKnowledgeIncident): ArgusEvent | null {
  return canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "vigia" });
}
```

Se conservan (no se eliminan los archivos) porque el costo es mínimo y ofrecen una red de seguridad ante cualquier import no descubierto en el reconocimiento de consumidores (§2) — la opción preferida, migrar los consumidores conocidos al nombre canónico, ya se aplicó en ambos endpoints (§6); los wrappers hoy no tienen ningún consumidor real de producción, solo los tests de igualdad (Caso 1).

| Mapeador | Consumidores previos | Estado final | Wrapper legacy |
|---|---|---|---|
| `vigiaIncidentToArgusEvent` | `/api/vigia/events` | Endpoint migrado al canónico; wrapper retenido, sin consumidores de producción | Sí — delegación pura de 1 línea, `@deprecated` |
| `knowledgeIncidentToArgusEvent` | `/api/chile-alerts` | Endpoint migrado al canónico; wrapper retenido, sin consumidores de producción | Sí — delegación pura de 1 línea, `@deprecated` |

---

## 8. Archivos modificados

**Nuevos**:
- `src/lib/canonical/canonicalKnowledgeIncidentToArgusEvent.ts` — mapeador canónico único.
- `tests/mappers/canonicalKnowledgeIncidentToArgusEvent.test.ts` — 15 casos obligatorios + variantes.
- `tests/mappers/canonicalMapperEndpoints.test.ts` — pruebas de integración ligera de los dos endpoints.
- `docs/architecture/ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md` — este documento.

**Modificados**:
- `src/lib/vigia/vigiaIncidentToArgusEvent.ts` — reducido a wrapper delegante.
- `src/lib/knowledge-intake/map/knowledgeIncidentToArgusEvent.ts` — reducido a wrapper delegante.
- `src/app/api/vigia/events/route.ts` — importa y llama al mapeador canónico directamente; comentario interno actualizado.
- `src/app/api/chile-alerts/route.ts` — importa y llama al mapeador canónico directamente.
- `src/lib/vigia/gdacsSeverity.ts` — docstring actualizado (referencia al mapeador canónico en vez del nombre legacy).
- `src/lib/incidents/alertPromotionEngine.ts` — comentario actualizado (referencia al mapeador canónico en vez del nombre legacy).
- `docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md` — Fase A marcada como implementada técnicamente (ver §11 abajo).

Ningún otro archivo productivo fue tocado. No se modificó `prisma/schema.prisma`, no hay migraciones, no se movieron datos, no se conectaron `Report`/`HelpRequest` ni módulos verticales, no se modificó deduplicación, cron, fuentes ni notificaciones, no se cambió la UI, no se actualizó versión ni changelog.

---

## 9. Tests

### Unitarios (`tests/mappers/canonicalKnowledgeIncidentToArgusEvent.test.ts`)

| Caso | Resultado esperado | Resultado real |
|---|---|---|
| 1 — Igualdad entre rutas | Wrapper legacy === canónico directo (ambos idPrefix) | ✅ Pasa |
| 2 — Severidad GDACS verde | Nunca alta/crítica sin impacto real | ✅ Pasa (`"medium"` con 1200 desplazados) |
| 3 — Severidad GDACS roja | Crítica | ✅ Pasa |
| 4 — Severidad desconocida | Fallback seguro (`"medium"`), nunca crítico | ✅ Pasa |
| 5 — Lifecycle activo | Estado `"active"` coherente | ✅ Pasa |
| 6 — Lifecycle resuelto | `"resolved"`, nunca `"active"`; cancelación por tag gana siempre | ✅ Pasa (2 sub-casos) |
| 7 — Lifecycle desconocido | Fallback documentado por severidad (`"risk"` para alta) | ✅ Pasa (unitario + integrado) |
| 8 — Geometría válida | Point/Polygon/MultiPolygon preservados sin fabricar fallback | ✅ Pasa (3 sub-casos) |
| 9 — Bbox | Nunca se convierte en polígono visible, cae a punto | ✅ Pasa |
| 10 — Coordenadas faltantes | `null` controlado, sin `NaN` | ✅ Pasa (2 sub-casos: ausentes y no finitas) |
| 11 — Datos demo | `isDemo` preservado; nunca `sourceType: "official"` | ✅ Pasa (+ caso de palabra débil en texto libre no detona falso positivo) |
| 12 — Fuente oficial | `official` solo cuando la fuente lo respalda | ✅ Pasa (positivo y negativo) |
| 13 — Fechas | Serialización UTC consistente, `Date` y `string` aceptados, fecha inválida no rompe | ✅ Pasa (3 sub-casos) |
| 14 — Inmutabilidad | El input no se modifica (objeto congelado no lanza) | ✅ Pasa |
| 15 — Determinismo | Misma entrada → mismo resultado | ✅ Pasa |

### Integración ligera de endpoints (`tests/mappers/canonicalMapperEndpoints.test.ts`)

| Caso | Resultado esperado | Resultado real |
|---|---|---|
| `/api/vigia/events` usa el mapeador canónico | Output idéntico a invocar el canónico directamente | ✅ Pasa |
| `/api/vigia/events` sin red real | Cero llamadas de red (fetch global bloqueado por `tests/setup.ts`) | ✅ Pasa |
| `/api/vigia/events` preserva filtro de severidad propio | Filtro aplicado fuera del mapeador | ✅ Pasa |
| `/api/vigia/events` preserva exclusión de archivados | Filtro aplicado fuera del mapeador | ✅ Pasa |
| `/api/chile-alerts` usa el mapeador canónico | Output idéntico a invocar el canónico directamente | ✅ Pasa |
| `/api/chile-alerts` sin conexión real a Prisma | Solo `getKnowledgeIncidents` mockeado se invoca; `prisma.knowledgeIncident.findMany` nunca se llama | ✅ Pasa |
| `/api/chile-alerts` preserva filtro de severidad propio | Filtro aplicado fuera del mapeador | ✅ Pasa |

Total: **127/127 tests pasan** en el repositorio completo (95 P0 preexistentes + 32 nuevos), cero regresiones.

---

## 10. Comandos ejecutados

| Comando | Resultado | Errores | Warnings |
|---|---|---|---|
| `npm run test:p0` | 6 archivos, 95 tests — todos pasan | 0 | 0 |
| `npm run test` | 8 archivos, 127 tests — todos pasan | 0 | 0 |
| `npx tsc --noEmit` (no existe `npm run typecheck` en `package.json`; se usó el compilador directamente) | 46 errores preexistentes, **ninguno en archivos tocados por esta tarea** — confinados a `src/lib/knowledge-intake/__tests__/{osmCategoryRegistry,osmOverpassAdapter,usgsEarthquakeImpactAdapter}.test.ts`, documentados en `vitest.config.ts` como archivos legacy inertes (globals de Jest no resueltos, no wireados a Vitest) | 0 nuevos | — |
| `npm run lint` | 24 warnings preexistentes (hooks `useI18n`/`useLiveMedicalRoute`/`useNavigationSession`/`useQuakeSenseMotion`/`useUserLocation`, `prisma.ts`, `fenixAccess.ts`, `reputationService.ts`), **ninguno en archivos tocados por esta tarea** | 0 | 0 nuevos |
| `npm run build` | No se ejecutó — no solicitado explícitamente como bloqueante y el cambio es de lógica de servidor sin superficie de UI; `tsc --noEmit` ya confirma ausencia de errores de tipos en los archivos tocados | — | — |

Nota sobre `typecheck`: `package.json` no define un script `typecheck`; se ejecutó `npx tsc --noEmit` como equivalente directo, dentro de los "helpers mínimos" de verificación permitidos. No se modificó `package.json` (no está en la lista de archivos permitidos del Prompt 9).

Búsqueda final de consumidores duplicados (`vigiaIncidentToArgusEvent|knowledgeIncidentToArgusEvent` en todo el repo): confirmado que las únicas referencias de código activo son las dos definiciones de wrapper (delegación pura, sin lógica) y los tests de igualdad; todo el resto son menciones en comentarios/documentación, actualizadas donde correspondía (§8).

---

## 11. Compatibilidad

**Sin cambios de estructura pública**: `ArgusEvent` no ganó ni perdió campos; ambos endpoints siguen devolviendo `{ source, count, events }` con la misma forma.

**Cambios de valor, intencionales y documentados** (no de estructura):
1. `/api/chile-alerts`: `confidence` puede pasar de `"high"` fijo a `"verified"` para incidentes con `confidenceScore >= 90` (el caso típico de SENAPRED) — convergencia aprobada por el diseño, no un bug.
2. `/api/chile-alerts`: `sourceType` ahora se resuelve vía el registry en vez de estar hardcodeado — sin cambio de valor real para `senapred_eventos` (ya es `official` en el registry).
3. `/api/chile-alerts` y `/api/vigia/events`: una alerta chilena recién declarada sin palabra clave de cancelación/modificación ahora puede mostrar `status: "active"` en vez de `"risk"` (ver §5, divergencia 1) — corrección de un caso que el mapeador legacy de Chile nunca cubría según su propio código.
4. Ambos endpoints: `isDemo` ahora se detecta con el helper centralizado `isDemoLikeSource` en vez de solo `tags.includes("seed")` — estrictamente más protector, nunca menos.
5. `tags` en la respuesta: se añade siempre `vigia:<amenaza>` (antes solo en VIGÍA); no se duplica un tag `lifecycle:*` cuando el incidente ya trae uno explícito (caso Chile).

**Sin cambios**: IDs públicos (`vigia-*`, `chile-alert-*` preservados exactamente vía `idPrefix`), geometría, fuentes/atribución, fechas, filtros de cada endpoint, autenticación, caché, formato de respuesta.

**Wrappers conservados**: sí, ambos, como delegación pura (§7) — no tienen consumidores de producción hoy, pero permanecen como red de seguridad.

**Código pendiente de retirar**: los dos archivos wrapper y la construcción directa de `ArgusEvent` dentro de `argusCorrelationEngine.correlateSignals()` (usada por `/api/argus/events`, fuera de alcance de esta tarea) — su retiro está programado en la Fase E del plan de migración, condicionado a que Fase D confirme cero consumidores reales durante ≥4 semanas.

---

## 12. Riesgos pendientes

Limitados estrictamente a lo que esta fase no resuelve (por diseño, ver Prompt 8):

- **Persistencia canónica futura (Fase C)**: `Incident.canonicalKey`, columnas tipadas de lifecycle/severidad, y la FK real reemplazando `RiskAssessment.relatedExternalEventIds` siguen sin implementarse — esta fase solo unificó la *lectura*, no escribió nada nuevo en la base de datos.
- **Lifecycle persistido**: `technicalFactorsJson.lifecycle` sigue viviendo en JSON no tipado, recalculado solo por el sweep de Global Watch entre corridas de cron — el mapeador canónico interpreta mejor las señales existentes, pero no cambia dónde ni cuándo se escriben.
- **Otros modelos todavía paralelos**: `ExternalEvent`, `Report`/`HelpRequest`, `RiskAssessment`, `ConflictZone`/`ConflictEvent`, y el `Incident`/`IncidentCommandView` sintético del Command Center permanecen exactamente como estaban — ninguno fue tocado, tal como exige el alcance estricto del Prompt 9.
- **Tercer sitio de construcción de `ArgusEvent`**: `argusCorrelationEngine.correlateSignals()` (usado por `/api/argus/events`) sigue sin pasar por el mapeador canónico — no consume `KnowledgeIncident`, por lo que no cae dentro del alcance de "los dos mapeadores duplicados" de esta tarea, pero queda como trabajo identificado para una fase futura si se decide que también debería proyectar desde el modelo canónico.
- **Futura integración de reportes y módulos**: `Report`/`HelpRequest` siguen sin FK a ningún incidente; los módulos verticales (ATLAS/VIGÍA/ORÁCULO/TALOS/HERMES/ARCA) siguen sin consumir `ArgusEvent` ni el mapeador canónico — ambos permanecen en el orden ya definido por la Fase D del plan de migración, no se adelantó ningún paso de esa fase.

---

## 13. Siguiente fase recomendada

Según `ARGUS_INCIDENT_MIGRATION_PLAN.md`, el siguiente paso natural es completar la **Fase B — capa canónica de lectura** (proyección unificada de solo lectura combinando `KnowledgeIncident` con `Report`/`HelpRequest` correlacionados en tiempo de consulta, detrás de un flag, sin tocar el esquema todavía) — no se implementa en esta entrega.
