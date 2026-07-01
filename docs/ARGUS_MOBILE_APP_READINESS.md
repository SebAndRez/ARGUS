# ARGUS Mobile App Readiness

Fecha: 2026-07-01.

## Web/PWA Actual

- `/app` ya existe como mapa operacional responsive.
- Manifest PWA basico agregado en `public/manifest.webmanifest`.
- Metadata Apple Web App agregada.
- SOS, Reportar, modulos, QuakeSense, Mobile Safety y Sensor Safety existen en
  web/PWA, pero varios son demo/runtime.

## PWA Installable

Estado: parcial.

Falta:

- Iconos PNG/maskable reales en 192/512.
- Service worker/offline shell.
- QA install en Android Chrome.
- QA iOS Safari add-to-home-screen.

## Android Native Ready

Estado: arquitectura y contratos preparados, app real no creada.

Requiere:

- Foreground Service.
- Notificacion persistente.
- FCM.
- Sensores nativos.
- WorkManager.
- Cola offline cifrada.
- Consent manager.

## iOS Native Ready

Estado: especificacion preparada, app real no creada.

Limitaciones:

- Background sensing limitado.
- Critical Alerts requieren aprobacion.
- No prometer always-on equivalente a Android.

## Safety Agent Ready

Estado: backend runtime/placeholder y docs listos. Operacion real requiere app
nativa y permisos.

## APIs Listas

- `POST /api/mobile/device/register`
- `POST /api/mobile/device/capabilities`
- `POST /api/mobile/events`
- `PATCH /api/mobile/check-in`
- `GET /api/mobile/push/preview`

## UI Lista

- Panel Mobile Safety readiness en Command Center.
- Modulos web existentes para Mobile Safety, Sensor Safety y QuakeSense.

## Blockers

- No FCM/APNs.
- No app nativa.
- No almacenamiento local cifrado.
- No service worker/offline real.
- No RLS/consentimiento versionado para datos sensibles persistentes.
