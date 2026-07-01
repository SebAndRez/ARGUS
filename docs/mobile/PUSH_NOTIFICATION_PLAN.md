# ARGUS Push Notification Plan

## Estado

No hay push real en este sprint. Existe `GET /api/mobile/push/preview` y
builders en `src/lib/mobile/pushPayloadBuilder.ts`.

## Android

- FCM.
- Canales por tipo: Safety Check, crash, fall, route, command.
- Prioridad alta solo para confirmacion de estado o emergencia.

## iOS

- APNs.
- Critical Alerts solo con aprobacion y caso justificado.
- Mensajes discretos por privacidad.

## Privacidad

- No mostrar RUT.
- No mostrar datos medicos.
- No mostrar nombre real en pantalla bloqueada por defecto.
- Payload minimo.
- Deep links a Safety Check.
- TTL corto para alertas operativas.

## Tipos

- `SAFETY_CHECK`
- `POSSIBLE_QUAKE`
- `POSSIBLE_CRASH`
- `POSSIBLE_FALL`
- `ROUTE_CHECK`
- `DEAD_MAN_CHECK`
- `COMMAND_ALERT`
- `TEST`

## Pendiente

- FCM/APNs secrets en entorno seguro.
- Registro de dispositivo persistente.
- Rate limits.
- Reintentos.
- Test mode.
