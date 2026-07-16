# ARGUS — plan de lanzamiento controlado

## Estado

**NO-GO. No ejecutar despliegue.** Este plan define condiciones mínimas para llegar a piloto; no autoriza cambios, commits, workflows ni producción.

## Puerta 0 — elegibilidad técnica

Debe completarse toda Fase 0 del backlog:

1. HelpRequest/Report no exponen texto o coordenada precisa a anónimos.
2. Mapa y Orbit no cargan ni conservan demo con el guard apagado.
3. Tests de regresión prueban ambos puntos en modo producción.

La puerta se rechaza ante cualquier P0.

## Puerta 1 — artefacto y pipelines confiables

- `test:p0`, `test`, `typecheck`, `lint` y `build` terminan 0 desde checkout limpio.
- `/dashboard` y `/modules/atlas` pasan smoke.
- SENAPRED tiene un propietario scheduled.
- `failed` retorna 5xx; partial tiene semántica explícita.
- La misma idempotency key no reejecuta un job completado.
- Diagnósticos live son operador-only y rutas costosas tienen rate limit.
- Redis distribuido falla cerrado y se verifica en staging multi-instancia.

## Puerta 2 — entorno candidato

Verificar sin exponer valores:

- DB y migraciones correctas; cero seed/demo residual.
- `AUTH_SECRET`, `CRON_SECRET`, Upstash y credenciales de fuentes presentes y rotables.
- Workflows apuntan al dominio staging/candidato correcto.
- Source Health distingue never-run, valid-empty, degraded y failed.
- Logs redactados llegan a sink con retención y alertas.
- Backup reciente, restore probado, RPO/RTO y rollback fechados.

## Alcance inicial propuesto después de cerrar puertas

### Habilitar solo en piloto interno

- Lectura canónica de incidentes para USGS, GDACS, EONET y SENAPRED.
- Mapa 2D sin demo y con estado unavailable visible.
- Notificaciones oficiales/confirmadas vigentes.
- VIGÍA de operador y Source Health.
- VESTA para cuentas de prueba sin datos sensibles reales.

### Mantener apagado

- Orbit hasta demostrar paridad de elegibilidad/conteo con 2D.
- FIRMS/EFFIS/EMS hasta validar credencial, correlación y health reales.
- ReliefWeb hasta validar credencial/licencia/frescura.
- ATLAS institucional, ORÁCULO, TALOS y FÉNIX hasta cerrar fragmentación y auditoría.
- AURA, HERMES y ARCA mientras puntos/rutas/capacidad sean demo.
- CUSTOS hasta RBAC institucional y auditoría persistida.
- NEXUS y Command Center.
- Las 18 fuentes manual-only y 15 disabled.

## Usuarios

Primera cohorte: operadores internos nominados por el usuario, cuentas individuales, sin roles demo, con soporte directo y ventana de mantenimiento. No ciudadanos, no instituciones externas y no público general.

## Monitoreo requerido

- Alertas por fallo total/parcial repetido, stale source, cero incidentes anómalo, caída DB/Redis, drops de proyección y error de notificaciones.
- Dashboard con runId/source/requestId, sin PII.
- Revisión diaria durante piloto de Source Health, duplicados y diferencias mapa/notificaciones.
- Criterio de parada: cualquier P0, alertas oficiales omitidas, demo visible, duplicación sistemática, restore/rollback no disponible o health ciego.

## Rollback

1. Detener workflows y ejecución manual.
2. Deshabilitar superficies piloto mediante flags efectivos previamente probados; hoy esos flags no existen para todo el alcance y deben incorporarse antes del piloto.
3. Revertir código al artefacto anterior controlado por el usuario.
4. No revertir migraciones destructivas automáticamente; aplicar runbook ensayado.
5. Restaurar datos solo desde backup verificado y con aprobación operacional.
6. Confirmar que no se siguen generando notificaciones ni fetches.

## Criterio de promoción

El piloto puede considerarse únicamente cuando no haya P0, los P1 de Fase 1 estén cerrados con evidencia, el score re-auditado sea al menos 70 y los siete días de observación no muestren omisiones/duplicados críticos. Producción pública requiere una auditoría posterior, score ≥85, cero bloqueadores, privacidad y recuperación probadas.
