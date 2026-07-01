# ARGUS Offline Queue Plan

## Objetivo

Permitir que la app nativa guarde eventos cuando no hay red y los envie cuando
vuelve la conectividad.

## Reglas

- SOS y Safety Check tienen maxima prioridad.
- Eventos locales expiran.
- Payload local cifrado.
- Dedupe por `dedupeKey`.
- Backoff exponencial.
- Limite de almacenamiento.
- No subir audio, camara ni trayectoria completa.

## Prioridades

- `SOS`
- `CHECK_IN`
- `SENSOR_EVENT`
- `REPORT`
- `LOW`

## Pendiente

- Implementacion Android Room/SQLCipher o equivalente.
- Pruebas de perdida de red.
- Reintentos con WorkManager.
- Politica de retencion local.
