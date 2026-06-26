# ARGUS Modules

ARGUS Core remains map-first: map, reports, SOS, risk, command context and
sources. Advanced products live behind the `Modulos` launcher so they do not
permanently cover the operational map.

## Launcher

The launcher is mounted once in `/app`. It opens a compact menu with:

- ARGUS Fenix Twin
- AURA Medic Mesh

Only one module panel can be open at a time.

## Fenix Twin

Fenix handles evacuation, route simulation, shelters, population exposure and
institutional action planning. The public layer should stay simple. The
institutional layer can show route collapse risk and action plans.

## AURA Medic Mesh

AURA Basic is included in ARGUS for citizens: medical SOS, optional emergency
profile, emergency QR and nearby demo medical points. AURA Pro is reserved for
future institutional medical command features.

## UI Rules

- Do not put all modules in the HUD.
- Do not block SOS or Reportar permanently.
- Mobile panels must use internal scroll.
- The map must remain visible behind module panels when possible.
- Do not collect mandatory medical data.
