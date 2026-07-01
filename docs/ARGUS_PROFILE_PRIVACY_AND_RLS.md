# ARGUS Profile Privacy And RLS

Estado: plan de privacidad/RLS. No aplicado todavia.

## Clasificacion De Datos

- Publico: alias, nombre visible autorizado, ciudad aproximada, rol comunitario.
- Privado: email, telefono, preferencias de contacto, zona habitual.
- Emergencia: contacto de emergencia, autorizaciones, ubicacion en SOS o Safety
  Check critico.
- Medico sensible: grupo sanguineo, alergias, medicamentos, condiciones,
  movilidad, dispositivos criticos y nota medica.
- Administrativo: estado de cuenta, sanciones, auditoria, verificacion.

## Riesgos

- Exponer telefono, email o contacto de emergencia a usuarios comunes.
- Exponer datos medicos sin emergencia o sin autorizacion.
- Usar datos medicos para reputacion o sanciones.
- Guardar datos sensibles sin RLS.
- Loguear datos sensibles en errores o auditoria excesiva.
- Mostrar identidad legal en vistas publicas.

## Reglas De Visibilidad

- `PUBLIC`: visible en interacciones comunitarias autorizadas.
- `PRIVATE`: solo visible para el usuario.
- `AUTHORIZED_UNITS_ONLY`: preparado para unidades verificadas; no exponer hasta
  tener RBAC real.
- `EMERGENCY_ONLY`: visible durante SOS, Safety Check critico o solicitud de
  ayuda, con autorizacion.
- `ADMIN_ONLY`: soporte, auditoria o seguridad.
- `HIDDEN`: no se muestra.

## Roles Sugeridos

- `CITIZEN`
- `ANALYST`
- `ADMIN`
- `SUPER_ADMIN`
- `VERIFIED_UNIT`
- `MEDICAL_UNIT`
- `EMERGENCY_OPERATOR`
- `INSTITUTIONAL`

## Policies Sugeridas

- Cada usuario puede leer y editar solo su propio perfil.
- Datos medicos y contactos de emergencia deben vivir en tablas separadas.
- Unidades verificadas solo pueden leer campos autorizados bajo contexto
  operativo y con auditoria.
- Admins pueden auditar bajo rol especifico.
- Lectura publica de tablas sensibles debe estar bloqueada.

## Estado Actual

- UI de perfil creada.
- Taxonomia de visibilidad creada.
- Persistencia real pendiente.
- RLS pendiente.
- RBAC institucional pendiente.
- Auditoria de cambios sensibles pendiente.

## Recomendacion Antes De Produccion

No persistir datos medicos ni contactos de emergencia en Supabase hasta tener:

- migraciones revisadas,
- RLS por tabla,
- roles verificados,
- logs seguros,
- consentimiento versionado,
- exportacion/borrado de datos personales,
- pruebas de acceso negativo.
