# ARGUS Profile TODO

## P0 - Privacidad Y Seguridad

- Crear modelos Prisma separados para perfil publico, contacto privado, contacto
  de emergencia, perfil medico y preferencias de privacidad.
- Implementar migracion segura sin `db push` destructivo.
- Agregar RLS completo en Supabase.
- Definir roles `VERIFIED_UNIT`, `MEDICAL_UNIT`, `EMERGENCY_OPERATOR` e
  `INSTITUTIONAL`.
- Agregar auditoria de cambios sensibles sin registrar contenido medico.
- Implementar consentimiento versionado.
- Implementar exportacion y borrado de datos personales.

## P1 - API

- `GET/PATCH /api/profile/me`
- `GET/PATCH /api/profile/privacy`
- `GET/PATCH /api/profile/emergency`
- `GET/PATCH /api/profile/medical`
- `GET /api/profile/completion`
- Validacion estricta de input, sanitizacion y limites de longitud.
- Pruebas de que un usuario no puede leer perfil de otro.

## P1 - UX

- Guardado persistente por seccion.
- Mensajes de error por campo.
- Onboarding inicial.
- Tutorial de privacidad.
- Resumen de que datos son publicos, privados y emergencia.

## P2 - Integraciones

- SOS puede consultar contacto de emergencia autorizado.
- Safety Check puede usar preferencias del perfil.
- AURA puede leer datos medicos autorizados solo en emergencia.
- App nativa puede respetar permisos de ubicacion y check-ins.

## P3 - Futuro

- Verificacion institucional de unidades.
- Guia para comunidades rurales.
- Guia para colegios y empresas.
- Panel de administracion de consentimientos.
- Historial de acceso a datos sensibles visible para el usuario.
