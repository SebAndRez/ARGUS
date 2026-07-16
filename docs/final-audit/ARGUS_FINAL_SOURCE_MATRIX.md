# ARGUS — matriz final de fuentes

Inventario ejecutable: `ARGUS_SOURCE_OPERATIONS_REGISTRY` contiene **43** entradas: 8 scheduled, 2 context_only, 18 manual y 15 disabled; 27 adaptadores implemented y 16 stub. Ninguna fuente se clasifica `operational` porque no se accedió a ejecuciones/variables de producción.

| Fuente | Rol | Scheduler/credencial | Persistencia | Consumidor | Salud | Estado auditado |
|---|---|---|---|---|---|---|
| USGS Earthquake | detección | Global Watch 5m; sin key | KnowledgeIncident + evidence | mapa/notificaciones | IngestionRun/Source Health | configured_not_scheduled |
| GDACS | detección | Global Watch 15m; sin key | KnowledgeIncident + evidence | mapa/notificaciones | IngestionRun/Source Health | configured_not_scheduled |
| NASA EONET | detección | Global Watch 30m; sin key | KnowledgeIncident + evidence | mapa | IngestionRun/Source Health | configured_not_scheduled |
| NASA FIRMS | detección | Global Watch 15m; `NASA_FIRMS_MAP_KEY` local presente, prod desconocida | KnowledgeIncident + evidence | wildfire/mapa | IngestionRun/Source Health | configured_not_scheduled |
| Copernicus EFFIS | confirmación | Global Watch 30m | KnowledgeIncident + evidence | wildfire/mapa | IngestionRun/Source Health | configured_not_scheduled |
| Copernicus EMS | confirmación | Global Watch 60m | KnowledgeIncident + evidence | wildfire/mapa | IngestionRun/Source Health | configured_not_scheduled |
| ReliefWeb | detección | Global Watch 30m; app name local presente, prod desconocida | KnowledgeIncident + evidence | mapa/notificaciones | IngestionRun/Source Health | configured_not_scheduled |
| SENAPRED Eventos | detección | **dos workflows 15m** | KnowledgeIncident + evidence | mapa/notificaciones | IngestionRun/Source Health | degraded |
| DMC mention | enrichment | contexto derivado SENAPRED | Evidence del incidente | SENAPRED | indirecta | manual_only |
| Open-Meteo | contexto | on-demand, sin key | ninguna | contexto coordenada | no persistida | manual_only |
| NewsEvidence | contexto | manual | ninguna automática | evidencia curada | no automática | stub |
| NWS | detección | manual; sin key | opcional por job/live | live/manual | run si persiste | manual_only |
| NOAA CO-OPS | contexto | manual | ninguna automática | ninguno | sin ejecución prod | manual_only |
| NOAA NCEI Tsunami | histórico | import manual | Knowledge* por import | conocimiento | run manual | manual_only |
| NOAA Storm Events | histórico | import manual | Knowledge* por import | conocimiento | run manual | manual_only |
| IOC SLSMF | enrichment | manual; key local ausente | ninguna automática | ninguno | sin señal | missing_credentials |
| OpenAQ | contexto | manual; key local ausente | ninguna automática | ninguno | sin señal | missing_credentials |
| HDX HAPI | enrichment | manual; identifier local ausente | ninguna automática | ninguno | sin señal | missing_credentials |
| WHO DON | detección | manual; sin key | posible import manual | ninguno automático | run manual | manual_only |
| ECDC | confirmación | manual; sin key | posible import manual | ninguno automático | run manual | manual_only |
| Copernicus GloFAS | detección | disabled; key ausente | ninguna | ninguno | no ejecutable | disabled |
| Copernicus GFM | detección | manual; token local ausente | ninguna automática | ninguno | sin señal | missing_credentials |
| Smithsonian GVP | detección/histórico | manual; sin key | Knowledge* por jobs | conocimiento | run manual | manual_only |
| USGS Earthquake Impact | enrichment | manual | Knowledge evidence/context | sismo | run manual | manual_only |
| OpenFEMA | histórico | import manual | Knowledge* | conocimiento | run manual | manual_only |
| USGS Water | enrichment | manual | ninguna automática | ninguno | sin señal | manual_only |
| USGS Volcano HANS | detección | manual | Knowledge* por job | conocimiento | run manual | manual_only |
| OSM Overpass | contexto | manual/bbox | CriticalPoi en sync; otros none | POI | endpoint auditado | manual_only |
| GDELT | contexto | manual | opcional manual | ninguno automático | sin señal | manual_only |
| CONASET Chile | histórico | disabled | ninguna | ninguno | ninguna | disabled |
| SENAPRED KI legacy stub | histórico | disabled | ninguna | ninguno | retirada | retired |
| CSB global | histórico | disabled | ninguna | ninguno | ninguna | disabled |
| IAEA global | detección | disabled | ninguna | ninguno | ninguna | disabled |
| NTSB global | histórico | disabled | ninguna | ninguno | ninguna | disabled |
| NHTSA global | histórico | disabled | ninguna | ninguno | ninguna | disabled |
| DesInventar | histórico | disabled | ninguna | ninguno | ninguna | disabled |
| EM-DAT | histórico | disabled | ninguna | ninguno | ninguna | disabled |
| CSN Chile | confirmación | disabled/no adapter | ninguna | ninguno | ninguna | not_configured |
| SHOA Chile | confirmación | disabled/no adapter | ninguna | ninguno | ninguna | not_configured |
| SERNAGEOMIN Chile | confirmación | disabled/no adapter | ninguna | ninguno | ninguna | not_configured |
| MOP Vialidad Chile | contexto | disabled/no adapter | ninguna | ninguno | ninguna | not_configured |
| DGA Chile | contexto | disabled/no adapter | ninguna | ninguno | ninguna | not_configured |
| CONAF Chile | confirmación | disabled/no adapter | ninguna | ninguno | ninguna | not_configured |

## Cadena de ejecución verificada por código

```text
GitHub Actions → endpoint con CRON_SECRET → lock global → scheduler por fuente
→ fetch con timeout → normalización/promoción → correlación → KnowledgeIncident/Evidence
→ IngestionRun/Source Health → mapa/notificaciones
```

La cadena existe en código para ocho fuentes, pero no se observó una ejecución productiva. FIRMS/ReliefWeb están configuradas localmente sin mostrar valores; el resto de la configuración externa es desconocida. Upstash no está configurado localmente y su estado productivo es desconocido.

## Hallazgos de fuentes

1. SENAPRED tiene cliente/normalizador compartido, pero dos propietarios scheduled.
2. Global Watch tolera fallos parciales, pero el handler oculta fallo total bajo HTTP 200.
3. Context/manual no equivale a operational; 18 fuentes no tienen scheduler.
4. Quince entradas están disabled; varias son stubs o instituciones registradas sin adaptador.
5. Source Health deriva estado desde runs, pero no se consultó la base real; “respuesta vacía válida” no pudo distinguirse de “nunca ejecutada” fuera de mocks.
