# ARGUS GRID - Visual QA checklist

Use this checklist after changes to map layers, markers, overlays, or dashboard layout.

## Setup

- [ ] Run `npm.cmd run dev -- --hostname 127.0.0.1 --port 3100`.
- [ ] Open `/app` at desktop width.
- [ ] Keep the browser console visible and confirm there are no new runtime errors.

## Citizen app

- [ ] Confirm the ARGUS HUD shows citizen mode, time, zone, UTC, GPS, active layers, events, and critical count.
- [ ] Change the map type between Tactical, Streets, and Light.
- [ ] Confirm the current map type is named in the layer panel.
- [ ] Review the "Capas activas" block and confirm each ON/OFF state follows its toggle.
- [ ] Activate visual sources and confirm camera markers are purple circles with `C`.
- [ ] Confirm official markers are red circles with short codes such as `WH` or `MET`.
- [ ] Confirm the verified ARGUS marker is a cyan circle with `ARG`.
- [ ] Open a camera/source popup and verify title, source, status, location, and external link.
- [ ] Toggle terrestrial, air, and maritime routes and compare their line styles with the legend.
- [ ] Activate weather/risk and confirm estimated polygons, wind direction, and the "Zona estimada, no exacta" notice.
- [ ] Activate demo reports and confirm the control shows `420`.
- [ ] Confirm clusters display clear numeric counts.
- [ ] Confirm Nearby Events shows `Mostrando 20 de 420 reportes demo` with default filters.
- [ ] Open a nearby alert and review confidence, source summary, recommended action, and lifecycle state.
- [ ] Test `Sigo viendo esto`.
- [ ] Open an expired demo alert and test its reactivation action.
- [ ] Activate USGS earthquakes and confirm loading is visible.
- [ ] If USGS loads, confirm count, last update, official marker, tooltip, and popup.
- [ ] If USGS fails, confirm the control and map message explain the connection error.
- [ ] Confirm SOS and Report remain accessible without overlapping the layer panel or Nearby Events.

## Command dashboard

- [ ] Open `/dashboard`.
- [ ] Confirm the HUD clearly shows `CENTRO DE MANDO`, role, time, zone, UTC, metrics, and system state.
- [ ] Confirm the command panel names the current map type.
- [ ] Confirm available sources, weather/risk, and route layers show counts and ON/OFF states.
- [ ] Toggle each available layer and confirm the map responds.
- [ ] Select an incident and review confidence, recommended action, status, and lifecycle information.
- [ ] Confirm the map remains inside its frame at desktop and reduced viewport widths.
- [ ] Confirm command, detail, users, and audit columns keep independent vertical scrolling where applicable.
- [ ] Confirm there is no horizontal page overflow.

## Mobile and regression

- [ ] Review `/app` at a narrow mobile viewport.
- [ ] Confirm the layer panel scrolls internally and does not cover all primary map actions.
- [ ] Confirm the Nearby Events carousel and incident detail panel do not overflow horizontally.
- [ ] Confirm map pan and zoom remain usable.
- [ ] Confirm `/dashboard` stacks without map or panel overflow.
- [ ] Run `npm.cmd run build`.
