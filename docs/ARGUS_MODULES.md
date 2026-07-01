# ARGUS Modules

ARGUS Core remains map-first: map, reports, SOS, risk, command context and
sources. Advanced products live behind the `Modulos` launcher so they do not
permanently cover the operational map.

## Launcher

The launcher is mounted once in `/app`. It opens a compact menu with:

- ARGUS Fenix Twin
- AURA Medic Mesh
- ARGUS QuakeSense
- Mobile Safety Agent
- ARGUS Sensor Safety Suite

Only one module panel can be open at a time.

## Fenix Twin

Fenix handles evacuation, route simulation, shelters, population exposure and
institutional action planning. The public layer should stay simple. The
institutional layer can show route collapse risk and action plans.

## AURA Medic Mesh

AURA Basic is included in ARGUS for citizens: medical SOS, optional emergency
profile, emergency QR and nearby demo medical points. AURA Pro is reserved for
future institutional medical command features.

## ARGUS QuakeSense

QuakeSense is an experimental citizen sensor layer for possible shaking. It is
opt-in, uses browser motion APIs only after user action and sends only
aggregate demo signals. The map layer is `Sacudida ciudadana`.

All user-facing copy must keep the event preliminary: ARGUS estimates, does not
confirm earthquakes and does not replace CSN, SENAPRED, SHOA, USGS or other
official sources.

## Mobile Safety Agent

Mobile Safety Agent models a future native safety check workflow. The current
implementation is Web/PWA demo only: it can create check-ins, simulate a
blocking check-in screen and expose `Safety Checks` on the map. It does not
send push notifications, contact emergency services or run background sensing.

## ARGUS Sensor Safety Suite

Sensor Safety extends the mobile safety foundation with RoadSense, FallSense,
Route Guardian, Dead Man Switch and Black Box. The web app only simulates these
flows; always-on sensing, push and background operation require native Android
or iOS work.

## UI Rules

- Do not put all modules in the HUD.
- Do not block SOS or Reportar permanently.
- Mobile panels must use internal scroll.
- The map must remain visible behind module panels when possible.
- Do not collect mandatory medical data.
