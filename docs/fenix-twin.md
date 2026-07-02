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
- Route impacts with demo/open/official metadata.
- Connected users as aggregate count only.
- Report density.
- Shelter pressure.
- Medical points.
- Public guidance.
- Institutional action plan.
- Confidence and limitations.

## Privacy

Fenix must never expose individual connected users, RUT, email, name or precise private location. Only aggregate approximate counts are allowed.

## Limitations

- Uses demo routes/refuges/population today.
- No official evacuation authority.
- No real propagation model.
- No persistence of simulations yet.

## P0 Visual Upgrade

Fenix now includes:

- Schematic map of initial impact and projected growth.
- Three prediction frames: initial, medium and extended projection.
- Coordinate and nearby settlement context.
- Population exposure estimate marked as preliminary.
- Route impact review marked as demo/open-data unless official source exists.
- Aggregated connected users only.
- Generated action plan after simulation.

The full flow is:

1. Coordinates and crisis parameters.
2. ARGUS geo/context analysis.
3. Simulation.
4. Action plan.
