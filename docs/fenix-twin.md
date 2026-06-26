# ARGUS Fenix Twin

ARGUS Fenix Twin is the institutional evacuation and response simulation layer
inside ARGUS GRID. Phase 1 is a demo-grade operational model, not a scientific
evacuation simulator and not a replacement for official instructions.

## Relationship With Routing Intelligence

Fenix consumes Routing Intelligence instead of acting as a standalone navigation
app. Routing Intelligence provides route state, capacity, flow, blockages,
allowed vehicles, confidence and risk. Fenix adds scenario context, population
exposure, shelter analysis and action plans.

## Access Levels

- Public: simple route/shelter instruction and basic warning.
- Institutional: route collapse signals, critical routes, alternative shelters
  and action items.

## Endpoints

- `GET /api/fenix/scenarios`
- `POST /api/fenix/simulation`
- `GET /api/fenix/shelters`
- `POST /api/fenix/action-plan`
- `GET /api/routing-intelligence/routes`

## Main Types

- `FenixScenario`
- `FenixEvacuationRoute`
- `FenixRouteCollapsePrediction`
- `FenixShelter`
- `FenixPopulationExposure`
- `FenixActionPlan`
- `FenixSimulationResult`

## Next Steps

- Persist scenario runs.
- Connect real route providers.
- Add official shelter feeds.
- Add audit trails and institutional permissions.
- Calibrate route capacity with real mobility data.
