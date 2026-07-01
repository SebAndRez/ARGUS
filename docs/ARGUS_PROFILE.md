# ARGUS Profile

Estado: UI preparada en `/app/perfil`. Persistencia sensible pendiente de
modelo, migracion, RLS y auditoria.

## Objetivo

Mi Perfil permite configurar identidad operativa, contacto privado, contacto de
emergencia, datos medicos minimos opcionales, privacidad y preferencias de
seguridad. No es una red social: existe para crisis, reportes, SOS, Safety Check,
validacion y preparacion futura de AURA Medic Mesh.

## Datos Publicos

- Alias publico.
- Nombre visible, si el usuario lo autoriza.
- Avatar futuro u opcional.
- Comuna o ciudad aproximada.
- Rol comunitario.
- Zona habitual aproximada sin direccion exacta.

Estos datos pueden aparecer en funciones comunitarias, reportes o validacion si
el usuario lo permite.

## Datos Privados

- Email privado.
- Telefono principal.
- Telefono secundario.
- Metodo preferido de contacto.
- Horario preferido.
- Nombre legal futuro si se implementa con controles fuertes.

No deben mostrarse a usuarios comunes ni enviarse a componentes que no los
necesitan.

## Datos De Emergencia

- Contacto de emergencia.
- Relacion.
- Telefono.
- Email opcional.
- Notas.
- Consentimiento para agregar el contacto.

La visibilidad por defecto es emergencia/unidades autorizadas cuando exista
validacion institucional. Hasta que RBAC real este activo, no debe exponerse fuera
de la cuenta del usuario.

## Datos Medicos Opcionales

- Grupo sanguineo.
- Alergias.
- Medicamentos importantes.
- Condiciones relevantes para emergencia.
- Movilidad o necesidades especiales.
- Dispositivo critico.
- Nota medica breve.

Reglas:

- Son opcionales.
- No se usan para reputacion, sanciones ni scoring.
- No se usan para diagnostico automatizado.
- Nunca son publicos.

## Uso Con SOS

SOS sigue disponible aunque el perfil este incompleto. En el futuro, el perfil
puede aportar telefono autorizado, contacto de emergencia, ubicacion permitida y
nota medica autorizada, pero ARGUS no debe afirmar despacho oficial si no existe
esa integracion.

## Uso Con Safety Check

El perfil prepara preferencias para recibir Safety Checks, compartir ubicacion en
estado critico y permitir acceso a contacto de emergencia bajo autorizacion.

## Uso Con AURA

El perfil prepara la capa basica de AURA: grupo sanguineo opcional, alergias,
contacto de emergencia y nota medica. La parte profesional de triage, ambulancias,
camas, hospitales, stock medico, traslado y mando sanitario queda como futura.

## Limites Actuales

- No se agregaron tablas Prisma para datos sensibles en esta tarea.
- No se crearon endpoints publicos de perfil sensible.
- La UI usa estado de sesion del navegador y muestra mensajes de preparacion.
- Persistencia real requiere RLS, roles, auditoria, consentimiento versionado y
  borrado/exportacion de datos.
