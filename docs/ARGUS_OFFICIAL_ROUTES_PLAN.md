# ARGUS Official Routes Plan

## Rule

ARGUS must not call a route official unless it comes from a verified government, transport, aviation or maritime authority source.

## Route Labels

- `Ruta oficial`: verified official source.
- `Ruta basada en datos abiertos`: open data, not official authority.
- `Ruta demo / ilustrativa`: demo or synthetic route.
- `Fuente oficial pendiente`: official source not yet integrated.

## Domains

### Terrestrial

Chile candidates: MOP, MTT, municipal open data and validated road authority feeds.

Global fallback: OpenStreetMap can be useful as open data, but is not official.

### Maritime

Chile candidates: DIRECTEMAR/SHOA or maritime authority datasets if public or under agreement.

Do not infer maritime routes without an official source.

### Aerial

Chile candidates: DGAC/AIP or aviation authority datasets if legally usable.

Do not infer official air corridors from demo geometry.

## Metadata

Routes should expose:

- `sourceType`
- `officialStatus`
- `isDemo`
- `disclaimer`

Current implementation marks demo routing honestly and prepares official candidate registry.

