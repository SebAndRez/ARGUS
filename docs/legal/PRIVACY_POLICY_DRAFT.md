# ARGUS Privacy Policy Draft

Este documento es un borrador y no constituye asesoria legal definitiva.

## Datos Tratados

- Cuenta: nombre, email, alias, rol, estado y proveedor de autenticacion.
- Identidad: RUT/ID o documento solo como hash o referencia segura si aplica.
- Ubicacion: reportes, SOS, Safety Check y funciones de mapa.
- Reportes ciudadanos.
- SOS.
- Datos medicos opcionales AURA.
- Contacto de emergencia.
- Senales de sensores: QuakeSense, RoadSense, FallSense y Safety Agent cuando
  existan permisos.
- Logs tecnicos y auditoria.
- Cookies de sesion.

## Datos Sensibles

Datos medicos, contacto de emergencia, ubicacion precisa, documento de identidad,
Safety Check critico, missing persons y sensores requieren controles reforzados.
No deben exponerse publicamente.

## Retencion

Debe definirse politica de retencion antes de produccion publica. Logs de
auditoria pueden requerir retencion separada. Reportes publicos pueden requerir
anonimizacion en vez de borrado completo.

## Exportacion Y Borrado

Exportacion de datos, borrado de cuenta, borrado de perfil medico y borrado de
contacto de emergencia deben implementarse antes de produccion publica con datos
sensibles reales.

## Terceros Y Fuentes Externas

ARGUS puede mostrar datos de USGS, GDACS, NOAA, MET Norway, NASA FIRMS u otras
fuentes. Cada fuente tiene condiciones y limitaciones propias.

## Seguridad

Se requiere RLS/RBAC, auditoria, minimizacion de datos, sanitizacion de
respuestas y pruebas de acceso negativo antes de operar datos sensibles reales.

## Contacto

sebastian.andres.official@gmail.com
