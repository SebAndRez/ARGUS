# ARGUS — Backlog de Activación de Fuentes

**Fecha**: 2026-07-14
**Tipo**: backlog — fuentes que todavía **no** pueden pasar a `executionMode: "scheduled"`.
**Alcance**: documento de planificación únicamente. Ninguna fuente listada aquí fue activada, ningún adaptador fue completado, ninguna credencial fue configurada en esta tarea.

Cada entrada indica la brecha específica que impide su promoción a Grupo A (programada), siguiendo el criterio del Prompt 16 §8: adaptador real + respuesta tipada + timeout + manejo de errores + credenciales disponibles o no necesarias + normalización canónica + persistencia idempotente + deduplicación + licencia/uso no bloqueante + tests + costo controlado.

---

## Prioridad alta (valor operacional inmediato, sin bloqueo de credencial)

### WHO DON (`who_don`)
- **Brecha**: falta normalizador canónico (`ArgusIncidentKnowledge`/`ArgusHazardDomain`), persistencia idempotente, deduplicación, tests de integración conectados a Global Watch.
- **Credencial**: ninguna requerida.
- **Parser**: `whoDonAdapter.ts` ya parsea RSS/XML real.
- **Licencia**: pública (OMS).
- **Persistencia/consumidor**: hoy ninguno automático — solo `/api/knowledge-intake/live/who-don` y el job manual `/api/knowledge-intake/jobs/run-who-don`.
- **Prueba requerida**: tests de normalización a dominio `public_health` + dedup por `país+patógeno+período` (patrón ya definido en `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §7.2) + test de integración con Global Watch.

### NWS (`nws`)
- **Brecha**: mismo patrón — normalizador + persistencia + dedup + tests.
- **Credencial**: `NWS_USER_AGENT` opcional (ya tiene fallback funcional).
- **Parser**: `nwsAdapter.ts` real, `fetch()` contra `api.weather.gov`.
- **Licencia**: pública (gobierno EE.UU.).
- **Persistencia/consumidor**: ninguno automático.
- **Prueba requerida**: normalización a `SEVERE_WEATHER`/`TORNADO`/etc., cobertura geográfica US, tests de integración.

### Smithsonian GVP (`smithsonian_gvp`)
- **Brecha**: normalizador + persistencia + dedup + tests.
- **Credencial**: ninguna.
- **Parser**: `smithsonianGvpAdapter.ts` real (WFS GeoJSON).
- **Licencia**: pública (Smithsonian).
- **Persistencia/consumidor**: `smithsonianGvpIngestionJobs.ts` existe para importación manual de catálogo histórico — no para cadencia live de erupciones activas.
- **Prueba requerida**: normalización a dominio `volcano`, distinción explícita erupción activa vs. catálogo histórico (rol `detection` vs `historical` según el modo invocado).

### USGS Volcano HANS (`usgs_volcano_hans`)
- **Brecha**: igual patrón — normalizador + persistencia + dedup + tests.
- **Credencial**: ninguna.
- **Parser**: real.
- **Licencia**: pública.
- **Persistencia/consumidor**: ninguno automático.
- **Prueba requerida**: normalización + tests de integración.

---

## Prioridad media (rol de confirmación/enriquecimiento, requiere respetar reglas de no-creación de incidentes duplicados)

### ECDC (`ecdc`)
- **Brecha**: `ecdcWhoDonDedupe.ts` ya define la clave de correlación cruzada con WHO DON, pero nadie la invoca automáticamente. Depende de que WHO DON se active primero (o en conjunto) para que la corroboración tenga sentido — activar ECDC solo, sin WHO DON, dejaría su rol `confirmation` sin nada que confirmar.
- **Credencial**: ninguna.
- **Parser**: real (RSS/API).
- **Licencia**: pública (UE).
- **Persistencia/consumidor**: ninguno automático.
- **Prueba requerida**: test de la clave de dedup cruzada ya existente aplicada en un pipeline real, no solo como función aislada.

### USGS PAGER / ShakeMap (`usgs_earthquake_impact`)
- **Brecha**: es un enriquecedor, no un detector — necesita lógica para **adjuntar** impacto a un `KnowledgeIncident` de sismo ya existente (por `externalId` USGS compartido), nunca crear uno nuevo. Esa lógica de "adjuntar a incidente existente sin duplicar" no existe todavía para esta fuente (patrón similar al ya implementado para incendios en `attachWildfireEvidenceToExistingIncident`, Prompt 15, pero para sismos).
- **Credencial**: ninguna.
- **Parser**: real (`usgsEarthquakeImpactAdapter.ts`, ya usado por `usgsEarthquakeImpactIngestionJobs.ts` para importación manual).
- **Licencia**: pública.
- **Persistencia/consumidor**: manual únicamente hoy.
- **Prueba requerida**: test explícito de "enriquece, no duplica" — mismo espíritu que el Caso 12 de la correlación de incendios (Prompt 15).

### OpenFEMA (`openfema`)
- **Brecha**: es histórico/declarativo por naturaleza — no necesita normalizador de detección en vivo, sino un modelo de consumo distinto (consulta bajo demanda para contexto de declaraciones de desastre de EE.UU., no ingestión periódica).
- **Credencial**: ninguna.
- **Parser**: real.
- **Licencia**: pública.
- **Persistencia/consumidor**: ninguno automático.
- **Prueba requerida**: si se decide activar, debe ser como fuente `historical`/`context_only` bajo demanda, nunca con intervalo de minutos — requiere decisión de producto explícita sobre qué endpoint la consumiría.

### NOAA Storm Events / NOAA NCEI Tsunami (`noaa_storm_events`, `noaa_ncei_tsunami`)
- **Brecha**: ambos son históricos/retrasados por diseño del proveedor (Storm Events se publica con retraso administrativo; NCEI Tsunami es catálogo histórico de eventos/runups). No son candidatos a cadencia live bajo ninguna circunstancia — su "activación" futura, si ocurre, sería como job de importación periódica de baja frecuencia (diaria o semanal), no como fuente de Global Watch.
- **Credencial**: ninguna.
- **Parser**: real para ambos.
- **Licencia**: pública.
- **Persistencia/consumidor**: ninguno automático.
- **Prueba requerida**: N/A hasta que exista una decisión de producto sobre el caso de uso histórico.

---

## Bloqueadas por credencial (código listo, falta configuración)

### IOC Sea Level Monitoring Facility (`ioc_slsmf`)
- **Brecha**: `IOC_SLSMF_API_KEY` no configurada. Rol `enrichment` (contexto de nivel del mar para tsunami) — también necesitaría lógica de "adjuntar a incidente de tsunami existente" antes de calificar para Grupo B, igual que USGS PAGER para sismos.
- **Licencia**: requiere solicitud de clave a UNESCO/IOC — pendiente de evaluación administrativa, no técnica.

### OpenAQ (`openaq`)
- **Brecha**: `OPENAQ_API_KEY` no configurada. Rol `context` (calidad del aire, relevante para humo de incendios) — candidato natural a enriquecimiento de incidentes `wildfire` ya persistidos, no a detección propia.
- **Licencia**: pública, requiere solo registro de clave gratuita.

### HDX/OCHA HAPI (`hdx_hapi`)
- **Brecha**: `HAPI_APP_IDENTIFIER` no configurada. Rol `enrichment` (exposición poblacional para crisis humanitarias) — enriquecería incidentes `humanitarian_crisis` ya existentes de ReliefWeb/GDACS.
- **Licencia**: pública (ONU/OCHA), requiere solo registro de identificador de aplicación.

### Copernicus Global Flood Monitoring (`copernicus_gfm`)
- **Brecha**: `COPERNICUS_GFM_ACCESS_TOKEN` no configurada.
- **Licencia**: requiere registro Copernicus, sin costo conocido.

### Copernicus GloFAS (`copernicus_glofas`)
- **Brecha adicional a la credencial**: el propio adaptador (`copernicusGlofasAdapter.ts`) nunca ejecuta una consulta real incluso con la credencial configurada — reclasificado a `stub` en esta tarea (ver `ARGUS_SOURCE_OPERATIONS_BASELINE.md` §5.2). Antes de considerar credencial y activación, requiere completar la implementación real de `fetchGlofasForecastMetadata()`/`fetchGlofasForecastSubset()` (fuera de alcance explícito de esta tarea — "no implementar adaptadores nuevos/completos").
- **Licencia**: requiere registro Copernicus EWDS.

---

## Rol contextual — no requieren Grupo A completo, candidatos a `context_only` conectado

### NOAA CO-OPS (`noaa_coops`)
- **Brecha**: no necesita normalizador de incidente — necesita una función de enriquecimiento que, dado un incidente costero/tsunami existente, adjunte contexto de marea/nivel del mar. Esa función de conexión (no el adaptador, que ya existe) no está escrita.
- **Credencial**: ninguna (solo `ARGUS_USER_AGENT` compartido opcional).
- **Prueba requerida**: test de enriquecimiento puntual bajo demanda, no de scheduler.

### OpenStreetMap / Overpass (`osm_overpass`)
- **Brecha**: ninguna real — ya se usa bajo demanda con guard de bbox en `/api/critical-pois/sync` (Prompt 12). No es candidato a cadencia periódica por diseño (el propósito es sincronizar POIs críticos bajo un área específica solicitada, no barrer el planeta cada N minutos).
- **Estado**: correctamente clasificado como `manual`/`context`, sin brecha pendiente que resolver salvo decisión de producto de ampliar su uso.

### GDELT (`gdelt`)
- **Brecha**: si se decidiera conectar como señal de contexto mediático, necesitaría: (1) un rol claramente `context` (nunca `detection` — ya decidido, ver `ARGUS_SOURCE_OPERATIONS_BASELINE.md` §7); (2) límites de volumen/tasa explícitos (GDELT puede devolver miles de artículos); (3) ninguna persistencia como incidente, solo como evidencia adjunta a incidentes ya existentes por proximidad temática/geográfica — lógica de correlación no escrita todavía.
- **Credencial**: ninguna.
- **Licencia**: términos de uso de GDELT Project — revisar antes de cualquier uso en producción a volumen (pendiente, no bloqueante para uso puntual ya existente vía `/api/knowledge-intake/live/gdelt`).

---

## No activables en esta fase (stub / sin código de ingestión)

Sin cambios respecto al registro — ver `ARGUS_SOURCE_OPERATIONS_BASELINE.md` §4.3 para la lista completa (8 stubs `plannedAdapterResult` + 6 fuentes chilenas sin adaptador). Ninguna tiene código de fetch real; su activación requeriría implementar el adaptador desde cero, explícitamente fuera de alcance de esta tarea y remitido al Prompt 20 ("la limpieza/implementación de código ocurre en tareas futuras").

De estas, las de mayor valor institucional si se implementaran en el futuro:
- **CONAF** (Chile, incendios forestales) — complementaría directamente la correlación de incendios del Prompt 15 con una fuente nacional autoritativa.
- **CSN** (Chile, sismología) — complementaría USGS/GDACS para sismos en territorio chileno con la fuente sismológica nacional.
- **SHOA** (Chile, alertas de tsunami) — fuente oficial nacional de tsunami, hoy ARGUS depende solo de USGS/GDACS/NOAA para esa amenaza en Chile.
- **SERNAGEOMIN** (Chile, volcanes/geología) — complementaría Smithsonian GVP/USGS Volcano HANS con la autoridad geológica nacional chilena.

Cada una requeriría, como mínimo: acceso confirmado a un feed/API real (hoy ninguna lo tiene documentado), diseño de adaptador, normalizador, persistencia, deduplicación, y tests — el mismo camino completo que cualquier fuente nueva.
