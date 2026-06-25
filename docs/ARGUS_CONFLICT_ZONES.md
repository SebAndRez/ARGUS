# ARGUS Conflict Zones

ARGUS Conflict Zones is a defensive situational-awareness layer for crisis,
travel risk and humanitarian context. It must not be used for targeting,
weapons, attack planning, harassment or propaganda.

## Language Rules

Use neutral, probabilistic labels:

- zona de conflicto activo
- zona bajo control militar reportado
- zona disputada
- zona con ataques recientes
- zona de riesgo elevado
- zona con catastrofe confirmada
- zona con alerta humanitaria

Do not present borders, control areas or open-source reports as certainty.
Every conflict zone is approximate unless a trusted official geometry exists.

## MVP Sources

- GDELT: active open-source signal provider, not authoritative by itself.
- ReliefWeb: active humanitarian/disaster context provider.
- Liveuamap: manual reference only. No scraping.
- ACLED: disabled until an API key and terms review exist.
- Major recognized media: secondary evidence only.

## Current App Layers

- CONFLICTOS: approximate conflict and crisis zones.
- ATAQUES: recent curated event signals.
- CONTROL: reported territorial control or disputed zones.
- NOTICIAS: secondary evidence markers.
- DESASTRES CONFIRMADOS: disaster-confirmed crisis zones.

## Demo Scope

The current implementation uses curated static examples for Ukraine,
Gaza/Israel/West Bank, the Middle East, Sudan, the Sahel and maritime risk
areas. It is intentionally testable without network calls or scraping.

## Safety Limitations

ARGUS must always show warnings as situational context, not as orders. A user
near a listed zone receives practical safety guidance such as avoiding
non-essential movement and checking official sources.

Future work: persistent source snapshots, automatic provider polling, analyst
review queues, evidence audit trails and cross-source confidence scoring.
