# ARGUS Profile QA

## Manual

- Abrir `/app/perfil`.
- Revisar lectura en 360, 390, 414 y 430 px.
- Editar alias.
- Guardar perfil publico.
- Guardar contacto privado.
- Intentar guardar contacto de emergencia sin consentimiento.
- Guardar contacto de emergencia con consentimiento.
- Guardar grupo sanguineo.
- Guardar alergias o nota medica.
- Cambiar privacidad.
- Confirmar que los mensajes indican que persistencia segura esta pendiente.
- Confirmar que SOS y Reportar siguen visibles en `/app`.
- Confirmar que no aparece informacion sensible en vistas publicas.

## Seguridad

- No imprimir secrets.
- No usar localStorage para datos sensibles.
- No crear endpoints inseguros.
- No persistir datos medicos sin RLS.
