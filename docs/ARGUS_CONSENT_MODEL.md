# ARGUS Consent Model

## Objetivo

Registrar consentimiento explicito, versionado y revocable para datos sensibles
y funciones experimentales.

## Tipos Iniciales

- `TERMS_ACCEPTED`
- `PRIVACY_ACCEPTED`
- `LOCATION_REPORTING`
- `SOS_LOCATION`
- `MEDICAL_PROFILE`
- `EMERGENCY_CONTACT`
- `SENSOR_SAFETY`
- `QUAKESENSE`
- `ROADSENSE`
- `FALLSENSE`
- `MISSING_PERSON_ESCALATION`
- `COMMAND_CENTER_VISIBILITY`
- `DATA_EXPORT`
- `DATA_DELETION`

## Record Conceptual

Ver `src/types/privacyConsent.ts`.

Campos: id, userId, consentType, version, acceptedAt, revokedAt, source,
ipHash opcional y userAgentHash opcional.

## Reglas

- No usar datos medicos sin consentimiento.
- No activar sensores experimentales sin consentimiento.
- SOS puede requerir ubicacion para operar, pero debe explicarse claramente.
- Revocacion debe ser posible para consentimientos no obligatorios.
- Cambios de terminos requieren nueva version.
