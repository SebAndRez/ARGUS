# ARGUS Sensor Safety Suite

ARGUS Sensor Safety Suite is the mobile-safety architecture foundation for
personal crisis workflows. The web/PWA version is demo/runtime only.

## Modules

- QuakeSense: deteccion preliminar de posible sacudida.
- RoadSense: deteccion preliminar de posible accidente vehicular.
- FallSense: deteccion preliminar de posible caida fuerte.
- Route Guardian: ruta segura opcional.
- Dead Man Switch: check-in periodico en modo emergencia.
- ARGUS Black Box: datos tecnicos minimos de evento critico.
- Safety Check: pregunta "¿Estas bien?".
- Emergency Escalation: si usuario no responde, alerta preliminar.

## Web/PWA Scope

The web/PWA implementation can:

- show settings
- simulate events
- create demo check-ins
- expose internal APIs
- feed Command Center demo evidence
- show Safety Checks on the map through existing layer support

It cannot reliably run while closed/minimized. Always-on detection requires a
native mobile app and platform-specific permissions.

## Native Requirements

Android future work:

- foreground service
- sensor permissions
- optional GPS with consent
- persistent notification
- FCM
- battery optimization handling
- WorkManager/offline queue

iOS future work:

- Core Motion constraints
- notification-first UX
- APNs
- possible Critical Alerts only after entitlement review
- no promise of always-on without platform validation

## Privacy

ARGUS Sensor Safety Suite must not store:

- audio
- camera
- full sensor streams
- continuous route history
- hidden background tracking

Allowed event payloads are minimal:

- time
- event type
- peak acceleration
- optional rotation peak
- optional speed before/after
- battery/network status
- approximate location only with consent
- app state and platform

## Escalation

No response does not confirm danger. It creates a preliminary signal for human
review if the user previously consented.

If the user answers `NEED_HELP`, `INJURED`, `TRAPPED` or `CANNOT_MOVE`, ARGUS
can create demo Command/AURA evidence. It must not contact real emergency
services in this phase.

## Integrations

Command Center:

- receives preliminary evidence and conservative priority.
- P0 is not allowed from sensor-only data.

AURA:

- can be linked when the user requests help.
- medical data remains private and optional.

Missing Persons:

- no response can become a candidate only with consent.
- never "persona desaparecida confirmada".

NAV / Fenix:

- multiple possible road events can suggest route review.
- no route is closed automatically.

Trust:

- personal accidents, falls and SOS volume do not award medals.
- useful configuration and confirmed community reports can be recognized.
