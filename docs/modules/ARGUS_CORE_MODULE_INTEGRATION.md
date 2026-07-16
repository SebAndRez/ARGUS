# ARGUS — Integración de ATLAS, VIGÍA, ORÁCULO y TALOS con la Realidad Operacional Canónica

**Fecha**: 2026-07-15
**Tipo**: integración de módulos — contexto operacional compartido sobre la proyección canónica ya aprobada.
**Alcance**: no se modificó `prisma/schema.prisma`, no se crearon migraciones, no se movieron datos históricos, no se creó una tabla `Incident` nueva, no se conectó NEXUS/HERMES/ARCA/AURA/CUSTOS/VESTA, no se rediseñaron los cuatro dashboards, no se cambiaron fuentes/cron/correlación de incendios/SENAPRED, no se hizo commit ni push.

---

## 1. Prerrequisitos confirmados

| Decisión | Confirmación |
|---|---|
| Persistencia canónica vigente | `KnowledgeIncident` + `KnowledgeEvidence` (Prisma), sin cambios — `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §4 |
| Proyección canónica | `ArgusEvent` vía `canonicalKnowledgeIncidentToArgusEvent()` (mapeador único, Prompt 9) — reutilizado sin modificar |
| Lifecycle operativo | `isIncidentOperationallyActive()`/`classifyLifecycleVisibility()` (Prompt 10) — reutilizado sin modificar |
| Severidad | Escala de 5 niveles `ArgusSeverity` (Prompt 8/9) — reutilizada sin recalcular |
| Fuentes/Source Health | Registro canónico de 43 fuentes + Source Health dinámico (Prompt 16) — reutilizado vía `/api/vigia/source-health/full` para VIGÍA operador |
| Taxonomía de notificaciones | `VerificationStatus`/`NotificationCategory` (Prompt 11) — vocabulario reutilizado conceptualmente, no importado directamente (ver §6) |

No hubo divergencias entre lo que el mandato asumía y el código real, salvo una: **"TALOS" en este mandato describe un motor de gemelo digital/simulación de impacto — esa funcionalidad real corresponde a FÉNIX (`src/lib/fenix/fenixSimulationEngine.ts`), no al módulo TALOS del repositorio** (`src/modules/talos/`, un motor de scoring/triage de riesgo transversal, ya con su propia identidad y documentación: "TALOS calcula, explica y prioriza — no simula"). Esta tarea integra el **módulo TALOS real** (el nombrado explícitamente en el mandato y en `src/data/argusModules.ts` como `argus-talos`), no FÉNIX — que ya tiene su propia canonicalización documentada en `docs/modules/ARGUS_FENIX_CANONICALIZATION.md` y queda fuera de alcance de esta tarea (conectar FÉNIX no fue pedido explícitamente y arriesgaría "rediseñar completamente los módulos").

---

## 2. Matriz de estado anterior

| Módulo | Ruta principal | Datos anteriores | Datos demo | Endpoint | Persistencia | Acceso |
|---|---|---|---|---|---|---|
| ATLAS | `/modules/atlas` | `Report`/`HelpRequest` vía `/api/events`; `CommandCenterPanel` (QuakeSense/MobileSafety/SensorSafety, 100% sintético, `operational: false` explícito) | `atlasDemoEvents` si `/api/events` devuelve 0 filas (heurística cliente, sin marca del servidor) | `/api/events` | `Report`/`HelpRequest` (Prisma) | institucional (`ANALYST`/`INSTITUTIONAL_ADMIN`/`ADMIN`/`SUPER_ADMIN`, pago) |
| VIGÍA | `/modules/vigia` | `Report`/`HelpRequest` vía `/api/events`, filtrado a `type==="REPORT"` | `vigiaDemoReports` con la misma heurística | `/api/events` | `Report` (Prisma) | público |
| ORÁCULO | `/modules/oraculo` | `Report`/`HelpRequest` vía `/api/events` → `crisisEventToVigiaReport` → `convertVigiaReportToOraculoEvidence` | `oraculoDemoEvidence` | `/api/events` | `Report` (Prisma) | autenticado (`ANALYST`/`OPERATOR`/institucional) |
| TALOS | `/modules/talos` | `Report`/`HelpRequest` vía `/api/events` (excluyendo `RESOLVED`) → `calculateTalosRiskAssessment` | `talosDemoAssessments` | `/api/events` | `Report`/`HelpRequest` (Prisma) | público (resultados simples) / institucional (panel completo) |

**Hallazgo consistente en los cuatro**: ninguno consultaba `KnowledgeIncident`/`ArgusEvent`/`/api/vigia/events`/`/api/argus/events` — los cuatro dependían exclusivamente de `Report`/`HelpRequest` (capa ciudadana), con una heurística cliente idéntica ("si la API devuelve 0 filas, usar datos demo") que nunca distinguía "sin incidentes" de "fallo real" (violación directa del Prompt 17 §20-§21, presente en los cuatro módulos antes de esta tarea).

---

## 3. Contexto operacional compartido

### 3.1 Arquitectura

```text
KnowledgeIncident (Prisma)
        ↓
canonicalKnowledgeIncidentToArgusEvent()   ← mapeador único (Prompt 9), sin cambios
        ↓
canonicalIncidentGateway.ts                ← NUEVO: consulta + deriva ModuleIncidentSummary
        ↓
moduleOperationalContext.ts                ← NUEVO: permisos server-side (canAccessModule) antes de exponer datos
        ↓
/api/modules/incidents[/[id]]              ← NUEVO: único endpoint compartido (Opción B, Prompt 17 §8)
        ↓
useCanonicalModuleIncidents() / useCanonicalModuleIncidentById()  ← NUEVO: hook cliente compartido
        ↓
CanonicalIncidentPanel (componente compartido) + adaptadores por módulo
        ↓
ATLAS / VIGÍA / ORÁCULO / TALOS
```

Se eligió **Opción B** (Prompt 17 §8: endpoint compartido) porque los cuatro dashboards son componentes de cliente (`"use client"`) que ya dependían de `fetch()` — un servicio server-side puro no habría sido invocable desde ellos sin además crear el endpoint. Un único endpoint (`/api/modules/incidents`, parametrizado por `?module=`) evita las cuatro rutas paralelas que el Prompt 17 §8 advierte no crear sin necesidad demostrada.

### 3.2 Contrato (`src/types/moduleOperationalContext.ts`)

`ModuleIncidentSummary` reutiliza los tipos ya aprobados (`ArgusSeverity`, `ArgusEventStatus`, `ArgusGeometry`, `ArgusConfidence`) en vez de declarar una segunda escala — es un subconjunto deliberado de `ArgusEvent`, no el modelo Prisma completo:

```ts
type ModuleIncidentSummary = {
  id: string; type: ArgusEventType; title: string; summary: string | null;
  severity: CanonicalSeverity; lifecycle: CanonicalLifecycle;
  verificationStatus: ModuleVerificationStatus; confidence: ArgusConfidence;
  location: { latitude, longitude, geometry, countryCode, regionCode };
  timing: { startedAt, updatedAt, expiresAt };
  sourceSummary: { primarySource, sourceCount, isOfficial };
  isDemo: boolean;
};
```

**Identidad**: `id` es el `KnowledgeIncident.id` crudo (cuid interno), no uno de los `id` prefijados que usan `/api/vigia/events` (`vigia-*`) o `/api/argus/events` (`chile-alert-*`) — esos prefijos son un artefacto de presentación de esos dos endpoints históricos. Los cuatro módulos comparten esta identidad cruda entre sí (criterio de aceptación §39.7); no se garantiza que coincida con el id que muestra el mapa general (fuera de alcance, "no modifique el mapa global").

### 3.3 Verificación — divergencia documentada

`ModuleVerificationStatus` reutiliza el vocabulario de `VerificationStatus` (`src/types/notificationCenter.ts`, Prompt 11), pero se **deriva de forma independiente** en `canonicalIncidentGateway.ts` a partir de campos ya presentes en `ArgusEvent` (`sourceType`, `needsOfficialConfirmation`) más un allowlist angosto (`NARROW_OFFICIAL_ALERT_SOURCE_IDS`) — **no** se importa la función privada `sourceTypeForKnowledge()`/`OFFICIAL_KNOWLEDGE_SOURCES` de `notificationCenterEngine.ts`, porque ese archivo está fuera de alcance de esta tarea (Prompt 17 §37: "no debe modificar... notificaciones generales"). Ambas listas son conceptualmente equivalentes (SENAPRED/USGS/GDACS/EONET/ReliefWeb = alerta oficial estricta; FIRMS/EFFIS/EMS = observación/corroboración, no alerta oficial por sí sola) pero se mantienen **manualmente sincronizadas** en dos archivos — limitación documentada, no un defecto oculto.

### 3.4 Filtros y paginación

Soportados: `lifecycle`, `severity`, `verificationStatus`, `type`, `countryCode`, `regionCode`, `dateFrom`, `dateTo`, `source`, `limit`, `cursor`, `includeDemo`. Garantías:
- Estados terminales excluidos por defecto (`isIncidentOperationallyActive`, sin cambios respecto al Prompt 10).
- `isDemo` excluido salvo `includeDemo=true` **y** `isDemoDataAllowed()` verdadero (nunca en producción sin permiso explícito).
- `limit` siempre acotado a 100 (`MAX_MODULE_INCIDENTS_LIMIT`); ventana temporal por defecto de 30 días si no se especifica `dateFrom`.
- Orden determinista: `updatedAt desc, id asc`.
- **Cursor**: simplificación deliberada — un offset numérico codificado en base64url, no un keyset cursor completo. Documentado como limitación aceptable dado el volumen todavía modesto de `KnowledgeIncident` (Prompt 17 §9 solo exige "cursor o paginación existente", no una implementación específica).

### 3.5 Errores y estados de carga

`ModuleContextResult<T>` — unión discriminada `available | empty | degraded | unauthorized | unavailable | insufficient_data`, cada una con su propio código de error normalizado (`UNAUTHORIZED`, `FORBIDDEN`, `DATA_UNAVAILABLE`, `UPSTREAM_DEGRADED`, `INVALID_INCIDENT_ID`, `INCIDENT_NOT_FOUND`, `INSUFFICIENT_DATA`). Un fallo de Prisma nunca se traduce a un array vacío — se traduce a `unavailable`/502. `CanonicalIncidentPanel` renderiza los seis estados de forma visualmente distinta (nunca "sin incidentes" para representar un fallo).

### 3.6 Caché

Deliberadamente sin caché persistente: cada módulo revalida al montar/cambiar de incidente seleccionado — evita mostrar lifecycle obsoleto (Prompt 17 §22) sin introducir una capa de invalidación que esta tarea no requería. El único ahorro de consultas duplicadas es estructural: los cuatro módulos comparten el mismo hook (`useCanonicalModuleIncidents`), así que agregar un quinto módulo no agrega una quinta implementación de fetch.

---

## 4. Integración por módulo

### 4.1 ATLAS (§11)

Se agregó, de forma aditiva (sin rediseñar el dashboard): una fila de 5 KPIs canónicos (activos/críticos/confirmados/candidatos/países) derivados de `ModuleIncidentSummary[]`, y un `CanonicalIncidentPanel` en la columna derecha, junto al feed existente de reportes ciudadanos (`AtlasIncidentFeed`, sin tocar). `CommandCenterPanel` (100% sintético) permanece sin cambios — ya se autodeclara `operational: false`, consistente con "no contar Source Health/sintético como amenaza territorial". Selección de un incidente canónico habilita el enlace "Ver en VIGÍA →".

### 4.2 VIGÍA (§12)

La integración más profunda, porque VIGÍA es la interfaz natural de detección/vigilancia/evidencia. Se agregó: `CanonicalIncidentPanel` (lista), `VigiaCanonicalIncidentDetail` (fuente primaria, conteo de fuentes, oficialidad, país, verificación, confianza, lifecycle, actualizado), y `VigiaSourceHealthMiniPanel` (resumen agregado de `/api/vigia/source-health/full`, **visible solo cuando `canValidate` es verdadero** — los mismos roles de validación ya existentes en `vigiaAccess.ts`, nunca público). Enlaces de salida: "Analizar en ORÁCULO →", "Evaluar impacto en TALOS →".

### 4.3 ORÁCULO (§13)

No se creó un motor nuevo de IA. `buildOraculoCanonicalAnalysis()` (`src/modules/oraculo/oraculoCanonicalAnalysis.ts`) produce una anotación de análisis ligera y honesta directamente sobre los campos ya agregados del incidente canónico (confianza→score 0-100, texto de verificación, conteo de fuentes) — **deliberadamente no** se fuerza el incidente de Global Watch a la forma `OraculoEvidence` que el motor OSINT existente (`oraculoScoring.ts`/`oraculoContradictions.ts`) espera, porque un `KnowledgeIncident` de FIRMS/GDACS no es "evidencia OSINT" en el sentido semántico que ese motor modela. Salida siempre marcada `isPrediction: false, isOfficial: false, analysisType: "source_reliability_snapshot"`.

### 4.4 TALOS (§14)

Tampoco se creó un motor nuevo: `calculateTalosRiskAssessment()` (el motor de riesgo ya existente, sin cambios) se reutiliza vía un adaptador de entrada (`buildTalosAssessmentInputFromCanonicalIncident`, análogo al ya existente `talosVigiaBridge.ts` para reportes ciudadanos) y un envoltorio de salida (`buildTalosCanonicalAssessmentView`) que separa explícitamente dato observado (el incidente canónico) de estimación (`TalosRiskAssessment`) y declara supuestos (`assumptions[]`) en texto plano. Cuando el incidente no tiene geometría puntual, el estado es `insufficient_data` — **nunca** se interpreta como impacto cero.

---

## 5. Relación con `Report`

No se creó ninguna FK ni migración. `Report`/`HelpRequest` siguen siendo la capa ciudadana de los cuatro módulos, sin tocar, presentados **junto a** (nunca fusionados con) el nuevo panel de incidentes canónicos — cada uno en su propia sección visual, con su propia etiqueta. No existe hoy una correlación persistente entre un `Report` y un `KnowledgeIncident` — correlacionarlos temporalmente por proximidad geográfica/temporal (Prompt 17 §15, opción permitida) queda fuera de esta tarea; se documenta como brecha futura (§7).

## 6. Relación con `HelpRequest`

Ningún `HelpRequest` se convirtió en incidente canónico. TALOS/ATLAS siguen leyendo `HelpRequest` únicamente a través de `/api/events` (ya sanitizado: sin teléfono, sin dirección exacta, solo `publicAlias`) — verificado explícitamente por test (`talosCanonicalIncidentAdapter.test.ts`: el adaptador de entrada solo expone `{id, title, category, severity, status, createdAt, updatedAt, location}`, ningún campo de `HelpRequest`).

## 7. `RiskAssessment`

Se revisó: `RiskAssessment.relatedExternalEventIds` (array JSON) ya es una correlación real y consultada activamente por `riskEngine.ts`/`/api/risk-assessments` (confirmado en `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §5.6), pero **ninguno de los cuatro módulos de esta tarea consume `RiskAssessment` hoy** — ORÁCULO tiene su propio `OraculoEvidence`/scoring, TALOS su propio `TalosRiskAssessment`, ninguno relacionado con el modelo Prisma `RiskAssessment`. No se modificó Prisma ni se vinculó `RiskAssessment` en esta tarea (no era necesario para conectar los cuatro módulos al incidente canónico) — queda documentado como integración futura posible si se decide que ORÁCULO/TALOS deban leer evaluaciones ya persistidas por TALOS/FÉNIX vía ese modelo en lugar de recalcular en el cliente cada vez.

---

## 8. Permisos

| Módulo | Roles autorizados (`argusModules.ts`) | Guard cliente (preexistente, sin cambios) | Guard servidor (nuevo, en el endpoint compartido) |
|---|---|---|---|
| ATLAS | `ANALYST/INSTITUTIONAL_ADMIN/ADMIN/SUPER_ADMIN` (institucional, pago) | `resolveAtlasAccess`/`AtlasAccessDenied` | `canAccessModule("argus-atlas", role)` vía `getModuleIncidentListContext` |
| VIGÍA | Público (todos los roles) | `resolveVigiaModuleAccess` | `canAccessModule("argus-vigia", role)` — siempre `true` |
| ORÁCULO | `ANALYST/OPERATOR/INSTITUTIONAL_ADMIN/ADMIN/SUPER_ADMIN` (autenticado) | `resolveOraculoModuleAccess` | `canAccessModule("argus-oraculo", role)` |
| TALOS | Público (resultados simples) / institucional (panel completo) | `resolveTalosModuleAccess` | `canAccessModule("argus-talos", role)` |

El guard servidor es **nuevo en esta tarea** — antes de ella, los cuatro módulos resolvían acceso únicamente en el cliente (`resolveXModuleAccess`, ejecutado en el navegador). El endpoint `/api/modules/incidents` es la primera vez que estos cuatro módulos tienen una verificación de rol **server-side** antes de servir datos operacionales — resuelta vía un adaptador nuevo (`toSessionUserForRoleMapping`, `moduleOperationalContext.ts`) porque `getCurrentUser()` (server, cookie-derivado) devuelve la fila Prisma cruda, distinta de `SessionUser` (la forma que todos los `resolveXRole` cliente ya esperaban desde `/api/auth/me`).

---

## 9. Feature flags

**No se crearon feature flags nuevos.** Se evaluó `ARGUS_CANONICAL_MODULE_CONTEXT`/`ARGUS_ATLAS_CANONICAL_DATA`/etc. (Prompt 17 §19) pero el riesgo real es bajo: la integración es puramente aditiva (nuevos paneles junto a los existentes, nunca un reemplazo destructivo), el endpoint nuevo falla de forma segura (`unauthorized`/`unavailable`, nunca expone datos sin permiso), y `isDemoDataAllowed()` ya gobierna la exclusión de demo en producción sin necesitar un flag adicional. Si en el futuro se requiere apagar la integración sin desplegar, el punto de rollback es remover las cuatro líneas `<CanonicalIncidentPanel .../>`/`<TalosCanonicalIncidentPanel .../>`/etc. de cada dashboard — no se justificó la complejidad de un flag central para esto.

---

## 10. Limitaciones documentadas

- **Verificación divergente**: `ModuleVerificationStatus` y `VerificationStatus` de notificaciones se derivan de forma independiente (dos allowlists de fuentes oficiales sincronizadas manualmente) — ver §3.3.
- **Cursor simplificado**: offset numérico, no un keyset cursor completo — ver §3.4.
- **`Report`/`HelpRequest` sin vínculo persistente**: correlación con `KnowledgeIncident` queda para una tarea futura (Prompt 17 §15 lo permite explícitamente dejar así).
- **`RiskAssessment` no conectado**: ninguno de los cuatro módulos lee ese modelo hoy — ver §7.
- **TALOS ≠ FÉNIX**: el mandato describía funcionalidad de gemelo digital que corresponde a FÉNIX, no al módulo TALOS real — ver §1.
- **Sin tests de renderizado DOM**: este repositorio no tiene `@testing-library/react`/jsdom configurado (Vitest corre en `environment: "node"`) — la navegación cruzada se verificó por aserciones de texto fuente (mismo patrón que `tests/p0/fenix-canonicalization.test.ts`), no por interacción de clic simulada.
