# Fenix Twin

Fenix Twin is an ARGUS simulation builder for crisis course estimation. It is not a scientific simulator and does not replace official instructions.

## Current Capabilities

- Generate simulation button.
- Crisis type.
- Initial location.
- Initial impact radius.
- Growth direction and speed.
- Simulation horizon.
- Exposed population estimate.
- Mobility mode.
- Public/institutional mode.
- Initial severity.
- Uncertainty.
- Source toggles represented in the request contract.

## Output

- Affected zones over time.
- Coordinate-based Leaflet map with estimated zones, demo routes and demo shelters.
- Route impacts with demo/open/official metadata.
- Connected users as aggregate count only.
- Report density.
- Shelter pressure.
- Medical points.
- Public guidance.
- Institutional action plan.
- Sources used and data-quality limitations.
- Confidence and limitations.

## Privacy

Fenix must never expose individual connected users, RUT, email, name or precise private location. Only aggregate approximate counts are allowed.

## Limitations

- Uses demo routes/refuges/population today.
- No official evacuation authority.
- No real propagation model.
- No persistence of simulations yet.
- Map circles are radius estimates, not official polygons.
- Institutional plans support human command decisions; they do not execute or
  declare actions automatically.

## P0 Visual Upgrade

Fenix now includes:

- Leaflet map centered on the analyzed coordinates with estimated impact radius,
  growth zones, route overlays and shelter points.
- Three prediction frames: initial, medium and extended projection.
- Coordinate and nearby settlement context.
- Population exposure estimate marked as preliminary.
- Route impact review marked as demo/open-data unless official source exists.
- Aggregated connected users only.
- Generated action plan after simulation.
- Public mode remains available to authenticated citizens.
- Institutional mode and action plan require OPERATOR, ANALYST, ADMIN or similar
  institutional roles.
- Source attribution separates ARGUS demo data, aggregate citizen signals and
  future official/open-data connectors.

The full flow is:

1. Coordinates and crisis parameters.
2. ARGUS geo/context analysis.
3. Simulation.
4. Action plan.
