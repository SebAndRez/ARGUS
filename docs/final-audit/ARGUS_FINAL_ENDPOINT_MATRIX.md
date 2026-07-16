# ARGUS — matriz final de endpoints

Inventario estático del árbol auditado: **168 archivos de ruta / 188 métodos exportados**. “Mutante” incluye métodos no GET y jobs/ingestors GET con efectos. La ausencia de rate limit no implica por sí sola vulnerabilidad, pero exige clasificación por costo/efecto.

| Ruta | Método | Mutante/efecto | Acceso observado | Rate limit | Lock | Estado |
|---|---|---:|---|---:|---:|---|
| /api/access/request | POST | sí | público | no | no | público sin rate limit |
| /api/admin/reports | POST | sí | operador | no | no | protegido/parcial |
| /api/admin/sanctions | POST | sí | operador | no | no | protegido/parcial |
| /api/argus/events | GET | no | público | no | no | público |
| /api/argus/senapred/live | GET | no | público | no | sí | P1 diagnóstico público |
| /api/argus/sources | GET | no | público | no | no | público |
| /api/audit/logs | GET | no | administrador | no | no | protegido/parcial |
| /api/auth/google/callback | GET | no | público | no | no | público |
| /api/auth/google/start | GET | no | público | no | no | público |
| /api/auth/login | POST | sí | público | sí | no | público |
| /api/auth/logout | POST | sí | público | no | no | público sin rate limit |
| /api/auth/me | GET | no | autenticado | no | no | protegido/parcial |
| /api/auth/register | POST | sí | público | sí | no | público |
| /api/chile-alerts | GET | no | público | no | no | público |
| /api/chile-alerts/run | POST | sí | operador | sí | sí | protegido/parcial |
| /api/command/overview | GET | no | público | no | no | público |
| /api/command/sources | GET | no | público | no | no | público |
| /api/conflict-events | GET | no | público | no | no | público |
| /api/conflict-zones | GET | no | público | no | no | público |
| /api/critical-pois | GET | no | público | no | no | público |
| /api/critical-pois/sync | POST | sí | operador | sí | no | protegido/parcial |
| /api/events | GET | no | público | no | no | público |
| /api/external-events | GET | no | público | no | no | público |
| /api/fenix/action-plan | POST | sí | operador | no | no | protegido/parcial |
| /api/fenix/scenarios | GET | no | público | no | no | público |
| /api/fenix/shelters | GET | no | público | no | no | público |
| /api/fenix/simulation | POST/GET | sí | operador | no | no | protegido/parcial |
| /api/firms/health | GET | no | público | no | no | público |
| /api/geocoding/search | GET | no | público | no | no | público |
| /api/health | GET | no | público | no | no | público |
| /api/help-requests/[id] | PATCH | sí | operador | no | no | protegido/parcial |
| /api/help-requests | GET/POST | sí | GET público completo; POST autenticado | no | no | P0 privacidad |
| /api/incidents/[id] | GET | no | público | no | no | público |
| /api/incidents | GET | no | público | no | no | público |
| /api/ingest/gdacs-alerts | GET | sí | público | no | no | live/manual/legacy |
| /api/ingest/met-weather | GET | sí | público | no | no | live/manual/legacy |
| /api/ingest/nasa-firms | GET | sí | público | no | no | live/manual/legacy |
| /api/ingest/noaa-tsunami | GET | sí | público | no | no | live/manual/legacy |
| /api/ingest/reliefweb-reports | GET | sí | público | no | no | live/manual/legacy |
| /api/ingest/status | GET | sí | público | no | no | live/manual/legacy |
| /api/ingest/usgs-earthquakes | GET | sí | público | no | no | live/manual/legacy |
| /api/jobs/run-chile-alerts | GET/POST | sí | cron secret | no | sí | protegido/parcial |
| /api/jobs/run-global-watch | GET/POST | sí | cron secret | no | sí | protegido/parcial |
| /api/knowledge/documents | GET | no | público | no | no | público |
| /api/knowledge/facts | GET | no | público | no | no | público |
| /api/knowledge-intake/health | GET | no | público | no | no | público |
| /api/knowledge-intake/import/file | POST | sí | operador | sí | no | protegido/parcial |
| /api/knowledge-intake/import/manual | POST | sí | operador | sí | no | protegido/parcial |
| /api/knowledge-intake/incidents/[id] | GET | no | público | no | no | público |
| /api/knowledge-intake/incidents | GET | no | público | no | no | público |
| /api/knowledge-intake/jobs/import-noaa-ncei-tsunami | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/import-noaa-storm-events | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/import-openfema-disaster-declarations | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/import-smithsonian-gvp-catalog | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-all | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-copernicus-gfm-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-copernicus-glofas-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-ecdc | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-eonet | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-gdacs | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-gdelt-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-hdx-hapi-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-ioc-slsmf-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-noaa-coops-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-nws | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-openaq-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-open-meteo-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-osm-overpass-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-smithsonian-gvp-activity | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-usgs | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-usgs-earthquake-impact | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-usgs-volcano-hans | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-usgs-water-context | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/jobs/run-who-don | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/lessons | GET | no | público | no | no | público |
| /api/knowledge-intake/live/copernicus-gfm | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/copernicus-glofas | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/ecdc | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/eonet | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/firms | GET | no | público | no | no | live/manual/legacy |
| /api/knowledge-intake/live/gdacs | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/gdelt | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/hdx-hapi | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/ioc-slsmf | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/noaa-coops | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/noaa-ncei-tsunami | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/noaa-storm-events | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/nws | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/openaq | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/openfema | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/open-meteo | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/osm-overpass | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/reliefweb | GET | no | público | no | no | live/manual/legacy |
| /api/knowledge-intake/live/smithsonian-gvp | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/usgs | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/usgs-earthquake-impact | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/usgs-volcano-hans | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/usgs-water | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/live/who-don | GET | no | operador | no | no | live/manual/legacy |
| /api/knowledge-intake/map-events | GET | no | público | no | no | público |
| /api/knowledge-intake/normalize | POST | sí | público | no | no | público sin rate limit |
| /api/knowledge-intake/reason | POST | sí | público | no | no | público sin rate limit |
| /api/knowledge-intake/review/[id] | POST | sí | operador | no | no | protegido/parcial |
| /api/knowledge-intake/review/pending | GET | no | operador | no | no | protegido/parcial |
| /api/knowledge-intake/similarity | POST | sí | público | no | no | público sin rate limit |
| /api/knowledge-intake/sources/[id] | GET | no | público | no | no | público |
| /api/knowledge-intake/sources | GET | no | público | no | no | público |
| /api/medical-aid | POST | sí | público | no | no | preview/runtime |
| /api/medical-points | GET | no | público | no | no | público |
| /api/missing-persons | GET/POST | sí | GET público; POST autenticado | no | no | protegido/parcial |
| /api/mobile/check-in | PATCH | sí | público | no | no | público sin rate limit |
| /api/mobile/device/capabilities | POST | sí | público | no | no | público sin rate limit |
| /api/mobile/device/register | POST | sí | público | sí | no | público |
| /api/mobile/events | POST | sí | público | sí | no | público |
| /api/mobile/push/preview | GET | no | público | no | no | público |
| /api/mobile-safety/check-in | GET/POST/PATCH | sí | público | sí | no | preview/runtime |
| /api/mobile-safety/escalate | POST | sí | público | sí | no | preview/runtime |
| /api/mobile-safety/quake-event | POST | sí | público | sí | no | preview/runtime |
| /api/mobile-safety/settings | GET/PATCH | sí | público | no | no | preview/runtime |
| /api/modules/incidents/[id] | GET | no | RBAC de módulo server-side | no | no | protegido/parcial |
| /api/modules/incidents | GET | no | RBAC de módulo server-side | no | no | protegido/parcial |
| /api/news-evidence | GET | no | público | no | no | público |
| /api/notifications | GET | no | autenticado | no | no | protegido/parcial |
| /api/operations/health | GET | no | operador | no | no | protegido/parcial |
| /api/pois/urban | GET | no | público | no | no | público |
| /api/predictive/analysis | GET | no | público | no | no | preview/runtime |
| /api/predictive/notification-feed | GET | no | público | no | no | preview/runtime |
| /api/predictive/run | POST | sí | público | no | no | preview/runtime |
| /api/profile/complete | POST | sí | autenticado | no | no | protegido/parcial |
| /api/profile/me | GET/PATCH | sí | autenticado | no | no | protegido/parcial |
| /api/quakesense/clusters | GET | no | público | no | no | preview/runtime |
| /api/quakesense/signals | GET/POST | sí | público | sí | no | preview/runtime |
| /api/reports/[id] | PATCH | sí | operador | no | no | protegido/parcial |
| /api/reports | GET/POST | sí | GET público completo; POST autenticado | no | no | P0 privacidad |
| /api/risk-assessments | GET | no | público | no | no | público |
| /api/routing/google-directions | GET | no | público | no | no | público |
| /api/routing-intelligence/routes | GET | no | público | no | no | público |
| /api/sanctions | GET/POST | sí | operador | no | no | protegido/parcial |
| /api/sensor-safety/check-ins | GET/POST/PATCH | sí | público | sí | no | preview/runtime |
| /api/sensor-safety/demo | POST | sí | público | sí | no | preview/runtime |
| /api/sensor-safety/detections | GET/POST | sí | público | sí | no | preview/runtime |
| /api/sensor-safety/escalate | POST | sí | público | sí | no | preview/runtime |
| /api/sensor-safety/settings | GET/PATCH | sí | público | no | no | preview/runtime |
| /api/session | GET | no | autenticado | no | no | protegido/parcial |
| /api/source-governance/layers | GET | no | público | no | no | público |
| /api/source-governance/run-all-policy | GET | no | público | no | no | público |
| /api/source-governance/sources | GET | no | público | no | no | público |
| /api/source-router/plan | POST/GET | sí | público | no | no | público sin rate limit |
| /api/sources/status | GET | no | público | no | no | público |
| /api/trust/achievements | GET | no | autenticado | no | no | protegido/parcial |
| /api/trust/profile | GET | no | autenticado | no | no | protegido/parcial |
| /api/trust/recalculate | POST | sí | autenticado | no | no | protegido/parcial |
| /api/trust/users/[id] | GET | no | público | no | no | público |
| /api/users/[id] | PATCH | sí | operador | no | no | protegido/parcial |
| /api/users | GET | no | operador | no | no | protegido/parcial |
| /api/vesta/checklist/[id] | PATCH/DELETE | sí | autenticado | no | no | protegido/parcial |
| /api/vesta/checklist | POST | sí | autenticado | no | no | protegido/parcial |
| /api/vesta/contacts | PUT | sí | autenticado | no | no | protegido/parcial |
| /api/vesta/family-plan | PUT | sí | autenticado | no | no | protegido/parcial |
| /api/vesta/guides | GET | no | público | no | no | público |
| /api/vesta/profile | GET/PATCH | sí | autenticado | no | no | protegido/parcial |
| /api/vesta/reminders/[id] | PATCH/DELETE | sí | autenticado | no | no | protegido/parcial |
| /api/vesta/reminders | POST | sí | autenticado | no | no | protegido/parcial |
| /api/vigia/events | GET | no | público | no | no | público |
| /api/vigia/run | POST | sí | operador | sí | sí | protegido/parcial |
| /api/vigia/source-health/full | GET | no | operador | no | no | protegido/parcial |
| /api/vigia/source-health/public | GET | no | operador | no | no | protegido/parcial |
| /api/vigia/source-health | GET | no | operador | no | no | protegido/parcial |

## Síntesis

- 77 archivos contienen métodos POST/PUT/PATCH/DELETE.
- 17 archivos invocan el helper central de rate limiting.
- 5 archivos adquieren locks de job.
- Los tres mutantes P0 históricos (import/manual, import/file, critical-pois/sync) están protegidos y probados.
- GET /api/help-requests y GET /api/reports son P0 por contrato de salida completo, no por mutación.
- GET /api/argus/senapred/live es un diagnóstico operativo público que consulta upstream.
- Las rutas live/manual y endpoints computacionales sin rate limit se mantienen como P1 de cobertura, con prioridad según costo y efecto.

## Convenciones de acceso

- **público:** no se observó guard de sesión en el handler.
- **autenticado:** usa usuario derivado de cookie firmada.
- **operador/administrador:** requireOperator/requireAdmin.
- **cron secret:** Bearer CRON_SECRET fail-closed.
- **RBAC de módulo server-side:** resuelve sesión y política por módulo en moduleOperationalContext.
- En rutas mixtas HelpRequest/Report/MissingPersons la columna separa GET y POST porque el guard solo está en la mutación.

