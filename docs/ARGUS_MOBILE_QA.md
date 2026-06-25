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
- Confirm `/api/risk-assessments?limit=3` returns a controlled response.
- Confirm `/api/knowledge/facts?hazardType=tsunami&country=Chile` returns a
  controlled response.
- Confirm `/api/knowledge/documents?hazardType=tsunami&country=Chile` returns a
  controlled response.
- Allow GPS and confirm the location state changes.
- Deny GPS and confirm ARGUS uses the fallback location.
- Confirm `/app` shows a visible error and retry action if the map cannot load.

## Map workflow

- Confirm the map loads and supports pan and zoom.
- Zoom out to global level and confirm ARGUS Orbit appears.
- Confirm ARGUS Orbit can be rotated with touch.
- Confirm zooming in or using the exit control returns to the 2D map.
- Open the layer panel and scroll through every control.
- Activate visual sources and open a popup.
- Activate live cameras, open a camera panel and close it.
- Confirm YouTube cameras load muted or show the external-source fallback.
- Confirm the expanded live camera catalog can be searched/scrolled without
  horizontal overflow.
- Open at least one camera marked `needs_review` and confirm the panel still
  shows source, location confidence and close control.
- Confirm closing a live camera returns focus to the map without moving layers
  or losing zoom.
- Activate routes and climate/risk.
- Activate NASA FIRMS and open a thermal event.
- Confirm the nearby events tray remains usable.
- Confirm marker symbols remain readable: earthquake diamond, tsunami triangle,
  thermal/fire glyph, citizen report circle, camera glyph and user ring.
- Open a USGS/GDACS/NOAA/FIRMS event and confirm **Analisis ARGUS** appears.
- Open a citizen report and confirm **Verificacion ARGUS** appears when there is
  no active assessment.
- Confirm the analysis block does not cover SOS, Report or the close control.

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
- Confirm widgets can be hidden and restored individually from the module rail.
- Confirm the live camera panel is usable in iPhone Safari portrait and
  landscape, with the close button visible.
- Confirm ReliefWeb is not shown as an active UI layer while the endpoint remains
  available for future work.
- Confirm `/app` without session shows only a compact `Login` button.
- Confirm the `Login` button opens `/login`.
- Confirm `/login` shows local login, `Continuar con Google` and `Crear cuenta`.
- Confirm Google start redirects to Google or returns a controlled missing-config
  message.
- Confirm duplicate RUT/document registration is rejected.
- Confirm SOS and Report are aligned in a single bottom-right action stack.
- Confirm on 390x844: HUD sits with safe margins, the toolbar is higher,
  Prediccion sits below controls and Clima does not overlap it.
