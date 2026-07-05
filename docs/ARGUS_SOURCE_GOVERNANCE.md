# ARGUS Source Governance, Layer Taxonomy & Intelligence Router

This phase adds a central governance layer for ARGUS sources. The goal is to decide what each source is allowed to do before it affects incidents, evidence, risk, map visibility or run-all jobs.

## Seven-layer Taxonomy

| Layer | SourceRole | Creation rule |
| --- | --- | --- |
| 1 | `incident_trigger` | May create live `KnowledgeIncident` records when deduped and traceable. |
| 2 | `observed_context` | Creates evidence/context; incident creation only with guardrails and review. |
| 3 | `forecast_signal` | Creates forecast signals, risk context or candidates; never confirmed incidents alone. |
| 4 | `impact_enrichment` | Enriches existing incidents and priority; does not confirm damage/casualties. |
| 5 | `baseline_context` | AOI/event/route/simulation context only; no incident creation. |
| 6 | `historical_memory` | Controlled import and Knowledge Base context; not live state. |
| 7 | `osint_signal` | Candidate/review/evidence only; never confirms by itself. |

## Source Classification

| sourceId | sourceName | sourceRole | secondaryRoles | canCreateIncident | canCreateCandidate | canUpdateIncident | queryMode | defaultPersistence | runAllDefault | citizenVisible | commandCenterVisible | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `usgs-earthquake` | USGS Earthquake | incident_trigger | - | yes | no | yes | global_polling | always | yes | yes | yes | Official earthquake live feed. |
| `gdacs` | GDACS | incident_trigger | - | yes | no | yes | global_polling | always | yes | yes | yes | Official/multilateral live alert source. |
| `noaa-tsunami` | NOAA Tsunami Warning Centers | incident_trigger | - | yes | no | yes | global_polling | always | yes | yes | yes | Follow official local authority language. |
| `noaa-nhc-cphc` | NOAA NHC/CPHC | incident_trigger | forecast_signal | yes | no | yes | global_polling | always | yes | yes | yes | Active advisories can trigger; cone/track remains forecast. |
| `nws` | NWS Alerts | incident_trigger | - | yes | no | yes | global_polling | always | yes | yes | yes | U.S. official active alerts. |
| `usgs-volcano-hans` | USGS Volcano HANS | incident_trigger | observed_context | yes | no | yes | global_polling | always | yes | yes | yes | Preserve HANS notice/source ids. |
| `nasa-eonet` | NASA EONET | incident_trigger | observed_context | yes | no | yes | global_polling | always | yes | yes | yes | Curated natural event feed. |
| `nasa-firms` | NASA FIRMS | incident_trigger | observed_context | yes | no | yes | global_polling | always | no | yes, relevant only | yes | Bounded thermal detections only. |
| `who-don` | WHO DON | incident_trigger | impact_enrichment | yes | no | yes | global_polling | always | yes | yes, controlled | yes | No diagnosis, restrictions or automatic alerts. |
| `ecdc` | ECDC | incident_trigger | impact_enrichment | guardrails | yes | yes | global_polling | always | yes | yes, controlled | yes | CDTR is evidence by default. |
| `copernicus-gfm` | Copernicus GFM | observed_context | impact_enrichment | guardrails | yes | yes | aoi_only | event_related | no | incident detail only | yes | Observed flood requires AOI/product context. |
| `noaa-coops` | NOAA CO-OPS | observed_context | impact_enrichment, baseline_context | guardrails | yes | yes | aoi_only | event_related | no | incident detail only | yes | Coastal observation context only. |
| `noaa-ndbc` | NOAA NDBC | observed_context | impact_enrichment, baseline_context | guardrails | yes | yes | aoi_only | event_related | no | incident detail only | yes | Coastal/ocean observation context. |
| `ioc-slsmf` | IOC SLSMF | observed_context | impact_enrichment, baseline_context | guardrails | yes | yes | aoi_only | event_related | no | incident detail only | yes | Not a warning center. |
| `usgs-water` | USGS Water | observed_context | impact_enrichment, baseline_context | guardrails | yes | yes | aoi_only | event_related | no | incident detail only | yes | Hydrological monitoring context. |
| `openaq` | OpenAQ | observed_context | impact_enrichment, baseline_context | no | yes | yes | aoi_only | event_related | no | no default | yes | Air observation context, not a health alert. |
| `usgs-shakemap` | USGS ShakeMap | observed_context | impact_enrichment, forecast_signal | guardrails | yes | yes | event_enrichment | event_related | no | incident detail only | yes | Shaking context, not damage confirmation. |
| `usgs-pager` | USGS PAGER | impact_enrichment | forecast_signal | no | no | yes | event_enrichment | event_related | no | incident detail only | yes | Estimated impact only. |
| `copernicus-glofas` | Copernicus GloFAS | forecast_signal | - | no | yes | no | aoi_only | event_related | no | no | yes | Forecast/model, not observed reality. |
| `open-meteo` | Open-Meteo | forecast_signal | impact_enrichment, baseline_context | no | yes | no | aoi_only | event_related | no | no default | yes | Weather forecast/context only. |
| `hdx-hapi` | HDX/OCHA HAPI | impact_enrichment | baseline_context | no | no | yes | event_enrichment | event_related | no | incident detail only | yes | Reference-period humanitarian context. |
| `osm-overpass` | OSM/Overpass | baseline_context | impact_enrichment | no | no | no | aoi_only | event_related | no | incident detail only | yes | Not a route closure/availability authority. |
| `nhtsa` | NHTSA | baseline_context | historical_memory | no | no | no | manual_import | manual_import | no | no | yes | Route/vehicle/historical context. |
| `noaa-ncei-tsunami` | NOAA NCEI Historical Tsunami | historical_memory | - | no | no | no | manual_import | manual_import | no | no | yes | Historical memory only. |
| `noaa-storm-events` | NOAA Storm Events | historical_memory | - | no | no | no | manual_import | manual_import | no | no | yes | Historical weather memory only. |
| `openfema` | OpenFEMA | historical_memory | impact_enrichment | no | no | no | manual_import | manual_import | no | no | yes | Institutional precedent/context only. |
| `smithsonian-gvp` | Smithsonian GVP catalog/history | historical_memory | baseline_context | no | no | no | manual_import | manual_import | no | no | yes | Volcano memory; reports have separate guarded policy. |
| `gdelt` | GDELT | osint_signal | - | no | yes | no | event_enrichment | event_related | no | no | yes | OSINT/media signal only. |
| `reliefweb` | ReliefWeb | osint_signal | impact_enrichment | no | yes | no | event_enrichment | event_related | no | no | yes | Humanitarian media/report signal. |
| `liveuamap-manual` | Liveuamap/manual conflict sources | osint_signal | - | no | yes | no | on_demand | event_related | no | no | yes | Analyst/review only. |
| `news-evidence` | News evidence | osint_signal | - | no | yes | no | on_demand | event_related | no | no | yes | Analyst/review only. |

## Incident and Candidate Rules

- `incident_trigger` sources may create incidents automatically when dedupe, source URL, source event id and update time are preserved.
- `observed_context` sources create evidence/context by default. Incident creation requires guardrails, active event/AOI context and review.
- `forecast_signal` sources create candidates/risk context only.
- `impact_enrichment`, `baseline_context` and `historical_memory` sources do not create live incidents.
- `osint_signal` sources create candidates/evidence only and always require review.

## Visibility Rules

Citizen default map:
- confirmed/live incidents, official alerts, nearby incidents, SOS and selected route/evacuation context when relevant.

Citizen blocked by default:
- raw OSINT, unvalidated CandidateIncident, raw evidence, source health, historical datasets, forecast uncertainty/model internals and low-confidence signals.

Command Center and analyst modes:
- can see all governed layers with role badges, caveats, confidence and review status.

Fenix/NAV/AURA:
- Fenix sees forecast, observed, historical and exposure context.
- NAV sees route-relevant observed/baseline context, not raw OSINT.
- AURA sees public health, air quality and medical/infrastructure context.

## Run-all Policy

Default run-all includes only live/official trigger sources such as USGS Earthquake, GDACS, NOAA Tsunami, NHC/CPHC, NWS, NASA EONET, USGS Volcano HANS, WHO DON and ECDC.

Default run-all excludes OSINT, historical imports, OSM, HDX/HAPI, OpenAQ, Open-Meteo, GloFAS, GFM, CO-OPS/NDBC/IOC, USGS Water, ShakeMap/PAGER and NHTSA.

Flag-gated sources still require bounded event/AOI/route/simulation context. Blocked sources are returned as warnings/reasons, not fatal errors.

## Source Router Examples

`POST /api/source-router/plan`

```json
{
  "purpose": "infrastructure_context",
  "module": "nav",
  "userMode": "nav",
  "context": { "hasAoi": true, "hasRoute": true }
}
```

`GET /api/source-governance/layers?mode=citizen`

Returns citizen-safe layers only.

`GET /api/source-governance/run-all-policy?includeMediaSignals=true`

Returns default sources plus blocked reasons for media/context/historical sources.

## Forbidden Operational Language

ARGUS must not say:
- "evacuate now" unless an official source explicitly says so and product policy allows it.
- "road closed" without an official road authority source.
- "confirmed deaths/injuries/damage" from PAGER, forecast/model or OSINT.
- "official alert" from OSINT, historical or context-only sources.

Allowed operational language includes:
- "review area"
- "prioritize assessment"
- "requires validation"
- "estimated impact"
- "satellite-observed flood"
- "forecast/model"
- "OSINT signal"
- "follow local authority"

## Future Local Sources

The registry is intentionally string-safe and extensible for Chile and other local authorities: CSN Chile, SENAPRED, SHOA, SERNAGEOMIN, MOP/Vialidad, MINSAL, VAAC and national volcano observatories can be added as new policies without changing the router contract.
