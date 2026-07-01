# RoadSense Native Spec

## Android

- Foreground service for active safety mode.
- Accelerometer and gyroscope.
- GPS speed only with explicit consent.
- Persistent notification while active.
- FCM for safety check notifications.
- WorkManager for retry/offline queue.
- Battery optimization education and fallback.

## iOS

- Core Motion while app is active or allowed by platform behavior.
- APNs for safety checks.
- No promise of always-on detection without platform validation.
- Critical Alerts require entitlement review.

## Privacy Model

- No audio.
- No camera.
- No hidden tracking.
- Approximate location only in emergency flow and with consent.
- Black Box payload stores minimal technical event data.

## API Payloads

Future app sends to `/api/sensor-safety/detections`:

- module
- type
- confidence
- approximate location
- platform
- app state
- black box reference

ARGUS responds with:

- accepted
- detectionId
- checkInRequired
- checkInId
- timeoutSeconds
