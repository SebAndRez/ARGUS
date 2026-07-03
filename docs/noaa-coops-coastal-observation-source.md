# NOAA CO-OPS Coastal Observation Source

Phase: ARGUS NOAA CO-OPS Coastal Observation Source Activation.

NOAA CO-OPS is integrated as official United States/NOAA coastal observation context. It is not a global warning center, tsunami alert source, evacuation order, bridge closure source, port closure source or official ARGUS inundation model.

Phase 1 capabilities:

- Station metadata and bounded station lookup by `stationId`, point/radius or bbox.
- Data API products: `water_level`, `predictions`, `wind`, `air_pressure`, optional `air_gap`.
- Explicit datum for water level and predictions, default `MLLW`.
- Observed and predicted measurements remain separated.
- `CoastalObservationContext` normalization.
- `KnowledgeEvidence` type `coastal_ocean_context`.
- Contextual map layer metadata: `NOAA CO-OPS Coastal Observations`, default off, not an incident layer.

Deferred phase 2 products:

- `currents`, `currents_predictions`, current station bins.
- Datums, flood levels and harmonic constituents as datum/flood-threshold context.
- OFS water-level model guidance, Derived Product API, sea-level trends, extreme water levels and yearly inundation statistics.

Deferred ocean-source expansion:

- NDBC ocean observations.
- IOC Sea Level.
- SHOA, JMA, BMKG and local tide gauges.

Operational caveat:

All recommendations must state that NOAA CO-OPS is coastal observation context only and requires validation with official warning centers, local authorities, transportation/port authorities and emergency management before operational action.
