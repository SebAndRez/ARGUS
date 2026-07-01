# ARGUS Mobile QA Checklist

## Devices

- iPhone Safari.
- iPhone Chrome.
- Android Chrome.
- 360 px, 390 px, 414 px, 430 px.

## Core Map

- `/app` loads without black screen.
- No horizontal overflow.
- SOS remains visible and tappable.
- Reportar remains visible and tappable.
- Layer panel scrolls internally.
- Event detail modal is usable.

## Modules

- Open `Modulos`.
- Open QuakeSense and confirm experimental notice.
- Open Mobile Safety and confirm demo/runtime notice.
- Open Sensor Safety and confirm native-app limitation notice.
- Open Fenix and AURA and confirm demo/future labels where applicable.

## Sensor Safety

- Simulate possible vehicle accident.
- Safety Check modal appears.
- Respond `Estoy bien`.
- Simulate fall.
- Simulate route stop.
- Simulate no response.
- Confirm `Safety Checks` layer can show demo marker.

## Trust

- Open `/profile`.
- Confirm Credibilidad ARGUS badge fits.
- Confirm achievements grid has no overflow.
- Confirm no email, RUT, phone, medical data or private location appears.
