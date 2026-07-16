# ARGUS — Matriz Completa de Fuentes e Integraciones

> Auditoría de solo lectura. Ninguna fuente fue modificada, ninguna clave fue impresa. Toda celda "Estado" usa el vocabulario obligatorio (confirmado / parcialmente confirmado / no conectado / implementado pero no utilizado / duplicado / simulado / obsoleto / roto / riesgo no comprobado / requiere prueba en ejecución). Evidencia verificada por lectura directa de código el 2026-07-13.

## 0. Hallazgo estructural previo

Existen **dos pipelines de ingestión que no se comunican entre sí**:

1. **Global Watch / VIGIA** (`src/lib/vigia/globalWatchEngine.ts`) — el único pipeline realmente **programado** (cron cada ~15 min vía `.github/workflows/argus-cron.yml` y `argus-global-watch.yml`). Persiste en `KnowledgeIncident` con deduplicación real.
2. **Knowledge-intake adapters** (`src/lib/knowledge-intake/adapters/*`, ~20 archivos) — implementados y funcionales de forma aislada, pero solo alcanzables manualmente vía `/api/knowledge-intake/live/*` o `/api/jobs/run-*`. **Sin scheduler**: no hay `node-cron`, `setInterval`, ni entrada en `.github/workflows/` que los invoque. Confirmado por búsqueda exhaustiva.

Esto significa que "fuente implementada" ≠ "fuente que efectivamente alimenta el mapa/notificaciones hoy". La columna **Estado** distingue ambos casos.

## 1. Matriz de fuentes

| Fuente | Cobertura | Autoridad | Categoría | Método | Frecuencia real | Auth (env var) | Estado | Persistencia | Normalización | Deduplicación | Visualización | Evidencia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| USGS Earthquake | Global | Científica/Oficial | Sismos | API GeoJSON | 15 min (cron Global Watch) | ninguna | confirmado | `KnowledgeIncident` | sí | externalId + cruce USGS/GDACS (pipeline legado) | Mapa, VIGIA, notificaciones | `globalWatchEngine.ts:130-133`, `correlateExternalEvents.ts:147-190` |
| NASA FIRMS | Global (CL+EU bbox) | Científica | Incendios | API CSV | 15 min (cron) | `NASA_FIRMS_MAP_KEY` | confirmado | `KnowledgeIncident` (clusterizado) | sí | cluster de grilla 0.2° + clave global | Mapa, notificaciones | `globalWatchEngine.ts:142-173`, `firmsClusterer.ts:14-31` |
| GDACS | Global | Oficial (ONU) | Multi-hazard | RSS XML | cron (registro indica 15 min en VIGIA, 5 min en sourceRegistry — **inconsistencia no resuelta**) | ninguna | confirmado | `KnowledgeIncident` | sí, con canonicalización de severidad (v1.0.3.2) | clave dedup | Mapa, notificaciones | `gdacsAdapter.ts`, `gdacsSeverity.ts:173-199`, `sourceRegistry.ts:63,218` |
| NASA EONET | Global | Científica (NASA) | Multi-hazard | API JSON | 30 min (cron) | ninguna | confirmado | `KnowledgeIncident` | sí | clave dedup | Mapa | `globalWatchEngine.ts:138-141` |
| Copernicus EFFIS | Europa | Oficial (UE) | Incendios | WFS GeoJSON | cron (Global Watch) | ninguna, requiere `SORTBY` | confirmado | `KnowledgeIncident` | sí | clave dedup | Mapa | `effisAdapter.ts:14-22,172-207` |
| Copernicus EMS | Global/UE | Oficial (UE) | Activaciones de emergencia | JSON API (nueva) | cron | ninguna | confirmado | `KnowledgeIncident` | sí | clave dedup | Mapa | `copernicusEmsAdapter.ts:13-14,119-153` |
| ReliefWeb | Global | OSINT/Humanitaria (OCHA) | Humanitario | API JSON | 30 min (cron) | `RELIEFWEB_APP_NAME` | confirmado | `KnowledgeIncident` | sí | clave dedup | Mapa, notificaciones | `globalWatchEngine.ts:182-188` |
| Open-Meteo | Global | Científica | Clima (contexto) | API JSON | — | ninguna | **implementado pero no utilizado** | ninguna | n/a | n/a | ninguna | `globalWatchEngine.ts:274-276` (rol "context" excluido del loop) |
| SENAPRED (Chile) | Nacional (CL) | Oficial | Multi-hazard | GraphQL/AppSync (scraping) | **dos jobs independientes**, ~7.5 min combinados | ninguna (AppSync anónimo) | **duplicado** | `KnowledgeIncident` **y** `ArgusEvent` vía dos adaptadores distintos | sí (dos veces, con reglas distintas) | por región/severidad más reciente | Mapa (dos rutas: live y promovida) | `senapredProvider.ts`, `senapredEventosAdapter.ts`, ambos sobre `senapredGraphqlClient.ts` |
| DMC/MeteoChile | Nacional (CL) | Oficial | Clima | Extracción de texto (sin feed directo) | según ejecución de Global Watch | n/a | no conectado (por diseño) | solo como texto de evidencia | parcial | n/a | Evidencia únicamente | `dmcProvider.ts:1-20` (`DMC_PROVIDER_STATUS="no_direct_feed"`) |
| NWS | EE.UU. | Oficial | Multi-hazard | API JSON | ninguna programada | `NWS_USER_AGENT` (recomendado) | implementado pero no utilizado | ninguna automática | sí (bajo demanda) | n/a | ninguna automática | ausente de `VIGIA_SOURCE_REGISTRY` y del switch de `globalWatchEngine.ts` |
| NOAA (tsunami/COOPS/storm events) | EE.UU./Global | Oficial | Tsunami/Océano/Tormentas | API/Atom | ninguna programada | ninguna | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `noaaNceiTsunamiAdapter.ts`, `noaaCoopsAdapter.ts`, `noaaStormEventsAdapter.ts` |
| IOC Sea Level | Global | Científica (UNESCO) | Nivel del mar | API | ninguna programada | `IOC_SLSMF_API_KEY` | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `iocSlsmfAdapter.ts:96,110` |
| OpenAQ | Global | Científica/Abierta | Calidad del aire | API | ninguna programada | `OPENAQ_API_KEY` | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `openAqAdapter.ts:71,83` |
| HDX/OCHA (HAPI) | Global | Humanitaria (ONU) | Humanitario | API | ninguna programada | `HAPI_APP_IDENTIFIER` | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `hdxHapiAdapter.ts:63,78` |
| WHO DON | Global | Oficial (OMS) | Salud pública | RSS/XML | ninguna programada | ninguna | implementado pero no utilizado | ninguna automática | clave cruzada con ECDC existe pero nadie la invoca automáticamente | ninguna automática | `whoDonAdapter.ts`, `ecdcWhoDonDedupe.ts:1-5` |
| ECDC | Europa | Oficial (UE) | Salud pública | API | ninguna programada | ninguna | implementado pero no utilizado | ninguna automática | ver arriba | ninguna automática | `ecdcAdapter.ts` |
| GDELT | Global | OSINT/Periodística | Señal de cobertura mediática | DOC 2.0 API | anunciada, **no ejecutada** | ninguna | **roto** (referenciada pero no invocada) | ninguna | n/a | ninguna | `globalWatchEngine.ts:189-193` retorna `fetched:0` incondicionalmente |
| Copernicus GloFAS | Global | Oficial (UE) | Inundaciones fluviales | API | ninguna programada | no documentada | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `copernicusGlofasAdapter.ts` |
| Global Flood Monitoring (GFM) | Global | Científica | Inundaciones | API | ninguna programada | no documentada | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `copernicusGfmAdapter.ts` |
| Smithsonian GVP | Global | Científica | Volcanes | WFS | ninguna programada | ninguna | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `smithsonianGvpAdapter.ts`; 6+ archivos de contexto GVP nunca importados (código muerto) |
| USGS PAGER / ShakeMap | Global | Científica/Oficial | Impacto sísmico | Feed de productos USGS | ninguna programada | ninguna | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `usgsEarthquakeImpactAdapter.ts:37,55-193` |
| OpenFEMA | EE.UU. | Oficial | Declaraciones de desastre | API | ninguna programada | ninguna | implementado pero no utilizado | ninguna automática | n/a | ninguna automática | `openFemaAdapter.ts` |
| NHTSA | EE.UU. | Oficial | Tránsito | *stub* | n/a | n/a | simulado/no conectado | ninguna | n/a | n/a | `nhtsaAdapter.ts` — `plannedAdapterResult`, cero referencias |
| SERNAGEOMIN, SHOA, CSN, DGA, MOP/Vialidad, CONAF (Chile) | Nacional (CL) | Oficial | Geología/Océano/Agua/Vialidad/Forestal | ninguno | n/a | n/a | **no conectado** | ninguna | n/a | n/a | `chile.ts:41-106`, todos `status:"requires_parser"`, cero código de fetch |
| CONAF (stub global), CONASET, CSB, DESINVENTAR, EMDAT, IAEA, NTSB, SENAPRED (stub knowledge-intake) | Global | Variada | Variada | *stub* | n/a | n/a | simulado/no conectado | ninguna | n/a | n/a | todos retornan `plannedAdapterResult`, cero referencias externas |
| Fuentes periodísticas | Global | OSINT | Cobertura | ver GDELT arriba | — | — | roto (ver GDELT) | — | — | — | — |

## 2. Hallazgos de deduplicación/correlación (detalle ampliado en `ARGUS_DATA_FLOW.md`)

- **Dos sistemas de dedup no comunicados**: el pipeline legado (`src/lib/ingestion/*` → `ExternalEvent`) hace correlación geo-temporal real USGS↔GDACS (haversine ≤300km/≤12h) y sismo↔tsunami, pero produce un registro `ArgusCorrelatedIncident` *adicional* en vez de fusionar — viola el principio "un evento real = un registro". El pipeline vigente (Global Watch) usa `buildGlobalDedupKey` (país:región:amenaza:coords redondeadas:bucket de fecha) + upsert por `externalId`, que si es un patrón real de "incidente + evidencia", pero con bucket de 1h/0.25° para sismos — más estrecho que la ventana de 12h/300km del motor legado, por lo que en la práctica **Global Watch (el único que corre por cron) no tiene correlación cruzada USGS-vs-GDACS operativa**.
- **FIRMS vs EFFIS vs Copernicus EMS**: no existe bucket de coordenadas específico para `WILDFIRE` en `COORD_PRECISION` (`dedup.ts:57-63`) — un hotspot satelital y un incendio confirmado por EFFIS/EMS a 40km de distancia el mismo día pueden generar dos incidentes en el mapa por el mismo fuego real.
- **SENAPRED live vs demo**: el modo semilla está correctamente aislado por `isDemoDataAllowed()` (falla en producción) — confirmado seguro. El riesgo real está en la **duplicación de adaptadores reales** (ver fila SENAPRED arriba), no en fuga de datos demo.

## 3. Fuentes declaradas pero nunca invocadas (adaptadores muertos)

`conafAdapter.ts`, `conasetAdapter.ts`, `csbAdapter.ts`, `desinventarAdapter.ts`, `emdatAdapter.ts`, `iaeaAdapter.ts`, `nhtsaAdapter.ts`, `ntsbAdapter.ts`, `senapredAdapter.ts` (stub de knowledge-intake, distinto de los dos adaptadores SENAPRED reales) — cero referencias fuera de su propio archivo. Además, 12+ archivos "context" (GVP/IOC/NOAA/OpenAQ cruzados) están completamente implementados pero jamás importados.

## 4. Top 5 hallazgos de esta fase

1. **P0 — Duplicación de ingestión SENAPRED.** Dos crons de GitHub Actions llaman al mismo backend AppSync anónimo cada ~7.5 min combinados, a través de dos adaptadores independientes que alimentan dos modelos distintos con reglas de clasificación divergentes. Riesgo de doble escritura, doble costo de scraping, y clasificación inconsistente del mismo evento real.
2. **P1 — GDELT y Open-Meteo anunciados pero inertes en el pipeline automatizado.** El código de `globalWatchEngine.ts` retorna resultados vacíos/excluye estas fuentes pese a que la documentación y comentarios sugieren cobertura real.
3. **P1 — Sin correlación cruzada de incendios (FIRMS/EFFIS/Copernicus EMS).** Falta bucket geográfico específico para wildfire; riesgo de doble conteo de un mismo incendio.
4. **P2 — ~20 adaptadores reales y con salud verificable no tienen scheduler alguno.** NWS, familia NOAA, IOC SLSMF, OpenAQ, HDX HAPI, WHO DON, ECDC, Copernicus GloFAS/GFM, GVP, USGS PAGER/ShakeMap, OpenFEMA, USGS Water — funcionan solo si alguien los invoca manualmente. Cualquier panel de "salud de fuentes" que los liste como "disponibles" sobreestima la cobertura operativa real.
5. **P3 — 9 adaptadores stub y 6 fuentes chilenas (`chile.ts`) sin código de fetch.** Bajo riesgo individual, pero inflan el conteo aparente de fuentes en cualquier registro/exportación.
