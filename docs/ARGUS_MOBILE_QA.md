# ARGUS GRID Mobile QA

## Browsers and orientation

- Open `/app` in iPhone Safari.
- Open `/app` in Chrome mobile.
- Test portrait orientation.
- Rotate to landscape and return to portrait.
- Confirm the map resizes without leaving blank or displaced areas.

## Runtime and APIs

- Confirm `/api/events` returns a successful response.
- Confirm `/api/ingest/status` returns a successful response.
- Allow GPS and confirm the location state changes.
- Deny GPS and confirm ARGUS uses the fallback location.
- Confirm `/app` shows a visible error and retry action if the map cannot load.

## Map workflow

- Confirm the map loads and supports pan and zoom.
- Open the layer panel and scroll through every control.
- Activate visual sources and open a popup.
- Activate routes and climate/risk.
- Activate NASA FIRMS and open a thermal event.
- Confirm the nearby events tray remains usable.

## Mobile layout

- Switch between `Vista mapa`, `Paneles` and `Capas`.
- Reload and confirm the last selected view is restored when storage is available.
- Confirm `Vista mapa` keeps SOS, Report and GPS controls visible.
- Confirm `Capas` opens a vertically scrollable layer panel.
- Confirm there is no horizontal overflow.
- Confirm the HUD respects the top safe area.
- Confirm SOS and Report remain tappable above the bottom safe area.
- Confirm the layer panel does not cover the entire viewport.
- Confirm report and SOS forms scroll when the keyboard is open.
