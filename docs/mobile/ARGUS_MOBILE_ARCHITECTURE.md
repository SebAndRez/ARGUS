# ARGUS Mobile Architecture

## Capas

- ARGUS Web/PWA.
- ARGUS Android App.
- ARGUS iOS App.
- ARGUS Backend.
- ARGUS Command.
- Notification Service.
- Offline Queue.
- Local Sensor Engine.
- Privacy/Consent Manager.
- Emergency Escalation.

## Android First

- Foreground Service para Safety Agent.
- Notificacion persistente cuando sensores esten activos.
- Acelerometro y giroscopio con procesamiento local.
- GPS aproximado con consentimiento; ubicacion fina solo emergencia y
  autorizada.
- WorkManager para reintentos y cola offline.
- FCM para Safety Check y alertas.
- Almacenamiento local cifrado.
- Battery optimization profiling.
- Deteccion local de posible crash/quake/fall; envio solo ante evento.

## iOS

- Core Motion en foreground y capacidades limitadas de background.
- APNs.
- Critical Alerts solo si aplica y con aprobacion Apple.
- Fallback con check-ins y notificaciones.
- No prometer always-on sin validacion.

## Backend

- APIs mobile aceptan eventos preliminares.
- No guardan push token plano.
- No contactan servicios de emergencia.
- No exponen ubicacion privada.

## Command

Mobile events aparecen como evidencia preliminar. P0 solo debe derivarse de
evidencia fuerte, multiples SOS, fuente oficial u operador.
