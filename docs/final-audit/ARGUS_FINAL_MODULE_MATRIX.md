# ARGUS — matriz final de módulos

| Módulo/capacidad | Datos | Backend | Permisos efectivos | Estado real | Producción |
|---|---|---|---|---|---|
| Mapa 2D | Report/HelpRequest, ingestors directos, KnowledgeIncident y demo | múltiples APIs | superficie accesible; acciones sensibles usan sesión | parcial con P0 demo/privacidad | Disabled |
| Orbit 3D | mismas colecciones del mapa; Argus solo high/critical | cliente Three.js | igual que mapa | parcial; filtros no equivalentes a 2D | Disabled |
| ATLAS | `/api/events`, usuarios/audit y gateway canónico aditivo | APIs Prisma + gateway | institucional, sesión server-side para datos canónicos/sensibles | parcial; `/dashboard` rompe build | Preview |
| VIGÍA | reportes ciudadanos + gateway canónico + Source Health | Report/API y KnowledgeIncident | público base; health full/acciones operador | parcial controlado | Limited tras P0/P1 |
| ORÁCULO | fixtures/legacy + incidente canónico seleccionado | análisis local determinista | analista/operador; gateway server-side | beta/preview | Preview |
| TALOS | legacy/demo + incidente canónico | adaptador/cálculo local | registry público; detalle por gateway | preview | Preview |
| FÉNIX | `FenixTwinPanel`, escenarios/adaptadores | `/api/fenix/*` | gate sesión + acciones operador | simulación institucional, no operación probada | Preview |
| HERMES | reportes reales opcionales, rutas y riesgo demo | motor cliente | público | parcialmente operacional; toda ruta marcada demo | Preview |
| ARCA | `arcaDemoShelters`, contador de reportes | cliente | público | preview; capacidad/rutas demo | Preview |
| AURA | 8 puntos médicos fijos y perfil demo/runtime | medical-aid demo/cliente | público; features por rol cliente | parcialmente operacional; sin red sanitaria real | Preview |
| CUSTOS | tres personas demo fijas | cliente; sin `/api/custos` | restringido; sesión real, roles institucionales no modelados | preview explícito; auditoría no persistida | Preview |
| NEXUS | ninguno | ninguno | institucional por placeholder | planned/placeholder | Disabled |
| VESTA | perfil/plan/contactos/checklist/reminders Prisma | `/api/vesta/*` | sesión/ownership por handler | CRUD real; recuperación/backup no verificados | Limited tras P1 |
| Command Center | incidentes sintéticos | memoria/demo guard | vista/acciones según gate | demo-disabled en producción | Disabled |
| Notificaciones | Report, ExternalEvent, KnowledgeIncident, health, VESTA y análisis | endpoint + engine | lectura pública contextual; datos demo guardados | motor operacional local, infra no verificada | Limited tras P0/P1 |

## Rutas directas y rol cliente falso

- El selector/localStorage demo se ignora en producción y se limpia; tests cubren rol falso.
- Los datos canónicos de ATLAS/VIGÍA/ORÁCULO/TALOS se autorizan server-side en `moduleOperationalContext`.
- FÉNIX protege acciones con `requireOperator`.
- CUSTOS no tiene datos reales que exponer, pero su auditoría es solo runtime y sus roles institucionales no pueden emitirse desde la sesión actual.
- `/admin/operations` tiene gate server-side. `/admin/source-health` expone el shell cliente, mientras el endpoint full está protegido; debe considerarse deuda de defensa en profundidad, no fuga de datos confirmada.

## Consumo canónico

ATLAS, VIGÍA, ORÁCULO y TALOS consumen `KnowledgeIncident` mediante un gateway compartido, pero como panel adicional. Sus dashboards siguen leyendo `/api/events` y datasets propios. FÉNIX, HERMES, ARCA, AURA, CUSTOS, NEXUS y VESTA no consumen de forma integral la vista canónica.

## Módulos que deben permanecer apagados

Todos en el árbol actual por NO-GO global. Tras cerrar P0/P1, solo VIGÍA, VESTA, Source Health y notificaciones podrían evaluarse para un piloto interno; los demás continúan Preview/Disabled hasta demostrar datos, permisos y trazabilidad reales.
