# ARGUS — matriz final de preparación de producción

**Veredicto global:** NO-GO. “Producción limitada” significa capacidad técnicamente acotable después de cerrar bloqueadores; no autoriza el árbol actual.

| Capacidad | Producción | Producción limitada | Preview | Disabled | Evidencia/decisión |
|---|---:|---:|---:|---:|---|
| Mapa de incidentes |  |  | X |  | Consume datos reales, directos y demo sin aislamiento; P0. |
| Alertas SENAPRED |  |  | X |  | Cliente/persistencia reales; schedulers duplicados y prod no verificada. |
| Sismos globales |  | X |  |  | USGS implementado/scheduled, pero ejecución productiva y mapa único no verificados. |
| Incendios globales |  |  | X |  | FIRMS/EFFIS/EMS y correlación existen; credencial/proveedor/producción no comprobados. |
| Notificaciones |  | X |  |  | Motor probado; depende de datos/persistencia/infra no aprobados. |
| ATLAS |  |  | X |  | Contexto canónico parcial; build de `/dashboard` roto. |
| VIGÍA |  | X |  |  | Reportes + panel canónico y source health; privacidad pública bloquea release. |
| ORÁCULO |  |  | X |  | Análisis canónico determinista aditivo; no plataforma OSINT completa. |
| TALOS |  |  | X |  | Adaptador canónico; evaluación y datos legacy/demo coexisten. |
| FÉNIX |  |  | X |  | Ruta unificada/RBAC; simulación institucional sin operación real verificada. |
| AURA |  |  | X |  | Ocho puntos médicos fijos, sin red/capacidad hospitalaria real. |
| HERMES |  |  | X |  | Geometrías/riesgo demo pese a algunos reportes reales. |
| ARCA |  |  | X |  | Refugios/capacidad/rutas demo. |
| CUSTOS |  |  | X |  | Datos de prueba y auditoría no persistida; label preview presente. |
| NEXUS |  |  |  | X | Placeholder, sin módulo/API. |
| VESTA |  | X |  |  | CRUD persistido autenticado; continuidad/privacidad/backup no verificados. |
| Command Center |  |  |  | X | Sintético deshabilitado en producción; no incident command real. |
| Source Health operador |  | X |  |  | API protegida y snapshot; ejecución real/alerting no comprobados. |

## Escenarios

| Escenario | Dictamen | Razón | Condición mínima |
|---|---|---|---|
| A — Público general | **no apto** | Demo en mapa, HelpRequest público, build roto, módulos simulados. | Cerrar ambos P0, build y P1 de público; revisión privacidad/claims. |
| B — Piloto controlado | **no apto** | P0 alcanzables incluso por anónimo y jobs no confiables. | Completar Fase 0 y Fase 1, entorno staging aislado, Redis/DB/monitoring/restore verificados. |
| C — Producción institucional | **no apto** | Roles institucionales/auditoría/continuidad no maduros. | Además RBAC real, auditoría persistida, restore y soporte operacional. |

## Alcance autorizable hoy

- **Puede usarse:** desarrollo local aislado, suites automáticas, revisión de código y demos claramente rotuladas sin datos reales ni decisiones operacionales.
- **Usuarios:** solo equipo interno de desarrollo/auditoría.
- **Condiciones:** red externa bloqueada o mocks; base local desechable; ningún workflow/scheduler; sin ciudadanos ni operadores reales.
- **Debe permanecer apagado:** mapa/Orbit operacional, jobs, fuentes live, notificaciones operacionales, Command Center, módulos institucionales y módulos públicos que muestran refugios/rutas/capacidad demo.

## Configuración mínima para reconsiderar un piloto

1. Cerrar PRIV-FINAL-001 y DATA-FINAL-001 con tests.
2. Build/test:p0/test/typecheck/lint pasan en checkout limpio.
3. Un propietario SENAPRED, códigos HTTP correctos e idempotencia duradera.
4. Upstash, credenciales y variables verificadas en staging sin exponer valores.
5. Solo habilitar inicialmente USGS, GDACS, EONET y una ruta SENAPRED canónica; FIRMS/ReliefWeb solo después de validar sus credenciales y health.
6. Mantener ARCA, HERMES, AURA, CUSTOS, ORÁCULO, TALOS, FÉNIX, NEXUS y Command Center en preview/disabled.
7. Alertas externas y runbook activos; backup/restore y rollback probados.

## Bloqueadores por puerta

### P0 antes de cualquier despliegue

- PRIV-FINAL-001 — HelpRequest/Report públicos completos.
- DATA-FINAL-001 — demo mezclado en mapa/Orbit.

### P1 antes de piloto

- REL-FINAL-001, ING-FINAL-001, OPS-FINAL-001, JOB-FINAL-001, SEC-FINAL-002, SEC-FINAL-003, OBS-FINAL-001, OPS-FINAL-002 y SCRIPT-FINAL-001.

### P1 antes de público

- DATA-FINAL-002 y MOD-FINAL-001.

### P2 post-piloto

- Claims, RBAC institucional, auditoría persistida, quality gate y estado leído.
