# Android Safety Agent Spec

## Goal

Provide a future native Android implementation for ARGUS Mobile Safety Agent
with explicit consent, local detection and emergency check-in.

## Candidate Capabilities

- Foreground service for active emergency monitoring.
- Local accelerometer processing.
- Offline queue for safety check responses.
- High-priority notifications for check-in.
- Optional coarse location only when a safety event is triggered.

## Safety Constraints

- No continuous location by default.
- No automatic emergency dispatch.
- No exact earthquake prediction language.
- No hidden sensor capture.
- Clear consent screen for emergency contacts and command center sharing.

## Open Work

- Battery profiling.
- Permission UX.
- Local storage encryption.
- Offline retry policy.
- Integration with official alerts when available.
# ARGUS Android Safety Agent Spec

## Estado

Android-first. Esta especificacion prepara una app nativa futura; no existe app
Android real en este sprint.

## Modulos

- QuakeSense.
- RoadSense.
- FallSense.
- Route Guardian.
- Dead Man Switch.
- Safety Check.

## Sensores

- Accelerometer.
- Gyroscope.
- GPS/coarse location.
- Activity Recognition si aplica.

## Android Runtime

- Foreground Service.
- Notificacion persistente.
- WorkManager para reintentos.
- FCM para notificaciones.
- Almacenamiento local cifrado.
- Procesamiento local; envio solo ante evento.

## Permisos

- `POST_NOTIFICATIONS`.
- `ACCESS_COARSE_LOCATION`.
- `ACCESS_FINE_LOCATION` solo emergencia y consentido.
- `FOREGROUND_SERVICE`.
- `ACTIVITY_RECOGNITION` si aplica.

## Privacidad

- No tracking permanente.
- No audio/camara.
- No trayectoria completa.
- Consent manager obligatorio.
- Battery profiling obligatorio.
- Falsos positivos deben poder cancelarse.

## API

Usar `src/types/mobileApiContracts.ts` y endpoints `/api/mobile/*`.
