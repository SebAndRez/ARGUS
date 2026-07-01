# ARGUS QuakeSense

ARGUS QuakeSense is an experimental Web/PWA citizen sensing layer for possible
ground shaking. It uses browser device motion only when the user explicitly
starts the module.

## Product Language

Allowed wording:

- alerta preliminar
- posible sacudida detectada
- estimacion ARGUS
- pendiente de confirmacion oficial
- experimental
- no reemplaza CSN, SENAPRED, SHOA, USGS ni fuentes oficiales

Do not use:

- terremoto confirmado, unless an official source confirms it
- epicentro exacto
- magnitud exacta
- alerta oficial ARGUS
- evacuar ahora, unless an official instruction exists

## Data Flow

1. The user opens `Modulos` and activates ARGUS QuakeSense.
2. The hook reads `DeviceMotionEvent` only after permission or explicit start.
3. Local heuristics detect a possible shake window.
4. If the user consents, ARGUS sends an aggregate citizen signal.
5. The server stores it in runtime memory for demo clustering.
6. The map layer `Sacudida ciudadana` can display preliminary clusters.

## Privacy

- No audio.
- No camera.
- No identity payload.
- Approximate location is optional and rounded.
- The browser session id is ephemeral and hashed.
- Signals are demo/runtime only in the current implementation.

## Limitations

QuakeSense is not earthquake prediction. It can confuse human motion, vehicles,
stairs, phones on tables and other vibrations. It must be correlated with
official sources and citizen reports before operational escalation.
