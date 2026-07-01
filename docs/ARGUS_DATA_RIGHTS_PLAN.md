# ARGUS Data Rights Plan

## Exportacion

Debe existir un endpoint futuro para exportar datos personales del usuario:
cuenta, reportes propios, preferencias, consentimientos y perfil opcional.

## Borrado De Cuenta

Borrar cuenta no siempre debe borrar reportes publicos ya usados en auditoria o
respuesta. La opcion recomendada es anonimizar autor y conservar trazabilidad
minima cuando exista interes publico o seguridad.

## Borrado De Perfil Medico

Debe ser independiente, inmediato y auditable. No debe borrar reportes ni SOS.

## Borrado De Contacto De Emergencia

Debe ser editable/borrable por el usuario y no quedar en logs con contenido
sensible.

## Retencion De Audit Logs

Audit logs pueden requerir retencion por seguridad, soporte o investigacion de
abuso. Deben minimizar datos personales.

## Retencion De Reportes

Reportes publicos pueden mantenerse anonimizados para continuidad operacional,
estadistica y auditoria.

## Endpoint Futuro

- `GET /api/data-rights/export`
- `POST /api/data-rights/delete-request`
- `DELETE /api/profile/medical`
- `DELETE /api/profile/emergency-contact`

No implementar endpoints destructivos sin aprobacion explicita.
