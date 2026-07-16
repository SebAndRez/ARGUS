# ARGUS — Auditoría Maestra

**Fecha**: 2026-07-13
**Alcance**: repositorio completo `argus-grid`, rama `phase-3-ui-ux`, verificado por lectura directa de código (sin modificaciones, sin commits, sin push, sin migraciones).
**Metodología**: 8 pases de investigación de solo lectura, cada uno con evidencia file:line, contra el norte estratégico y el vocabulario de estados definidos en el mandato de auditoría. Documentos de detalle: `ARGUS_SYSTEM_MAP.md`, `ARGUS_SOURCE_MATRIX.md`, `ARGUS_ENDPOINT_MATRIX.md`, `ARGUS_MODULE_MATRIX.md`, `ARGUS_DATA_FLOW.md`, `ARGUS_MASTER_BACKLOG.md`, `ARGUS_TECHNICAL_DEBT.md`.

## 1. Resumen ejecutivo

ARGUS tiene, verificado en código, un núcleo de ingestión real y razonablemente maduro (Global Watch: USGS, GDACS, EONET, FIRMS, ReliefWeb, EFFIS, Copernicus EMS, SENAPRED, con deduplicación y persistencia genuinas) y un mapa 2D/Orbit 3D que **comparten correctamente una única fuente de datos** — un resultado mejor de lo que la documentación previa hacía suponer. Pero ese núcleo está rodeado de un número significativo de subsistemas que aparentan estar conectados y no lo están: un "Command Center" de incidentes 100% sintético, un módulo FÉNIX duplicado donde el menú dirige a la versión falsa, seis módulos verticales que nunca ven los datos del pipeline de ingestión real, tres endpoints mutantes sin autenticación, y una entidad de incidente que existe en al menos cinco formas paralelas y desconectadas.

ARGUS no es today una "colección improvisada sin ningún criterio" — hay disciplina real en partes del sistema (autenticación de sesión sólida, deduplicación de Global Watch, resolución de geometría chilena real, guard de datos demo bien diseñado aunque no desplegado). El problema dominante no es la ausencia de buena ingeniería, sino la **acumulación de subsistemas construidos en momentos distintos sin una capa de unificación**, exactamente el patrón que el mandato de esta auditoría pide corregir antes de seguir expandiendo.

## 2. Nivel de madurez general

**ARGUS está en etapa de plataforma en construcción con núcleo funcional parcial — no lista para operación de crisis real sin las correcciones P0, y no lista para escala comercial.**

## 3. Estado por área (porcentajes justificados)

| Área | % | Justificación |
|---|---|---|
| Núcleo de ingestión | **58%** | Global Watch es real y programado para 8 fuentes con dedup/persistencia genuina; pero ~20 adaptadores implementados no tienen scheduler y 9 son stubs puros. Ver `ARGUS_SOURCE_MATRIX.md`. |
| Realidad operacional única | **20%** | 5+ modelos paralelos de "incidente" sin identidad compartida; `/api/incidents` es 100% sintético; ningún módulo vertical usa `ArgusEvent`. Ver `ARGUS_DATA_FLOW.md`. |
| Mapa 2D | **68%** | Geometría real (no bbox) para la mayoría de casos, sistema de símbolos con 3 de 5 canales realmente independientes, clustering funcional. Penalizado por el remanente del bug de rectángulo en el adaptador SENAPRED en vivo. |
| Orbit 3D | **60%** | Confirmado que comparte la misma fuente `ArgusEvent` que el mapa 2D (mejor de lo esperado) pero con filtros de severidad y tope de 650 marcadores que reducen su utilidad operativa independiente. |
| Fuentes | **50%** | Amplia cobertura de adaptadores implementados, pero solo ~8-9 de ~30 fuentes están efectivamente programadas y alimentando el sistema en producción. |
| Deduplicación | **38%** | Sólida dentro de Global Watch (dedup key + upsert), pero sin bucket específico para incendios, sin correlación cruzada USGS-GDACS en el pipeline vigente, y con un segundo sistema de dedup legado desconectado. |
| Lifecycle | **25%** | Real solo dentro de `KnowledgeIncident` (vía Global Watch); estados `resolved` no se filtran en lectura; `ExternalEvent.expiresAt` es un campo muerto; otros 2 vocabularios de lifecycle (`Incident`, `CrisisEvent`) son solo tipos TS nunca conducidos por datos reales. |
| Notificaciones | **42%** | Convergencia real de 8 fuentes con geolocalización y dedup por firma, pero sin diferenciación visual de categoría al cliente, con fuga de datos demo no gateada, y con fatiga de alertas confirmada (contador no excluye resueltos). |
| Permisos | **55%** | Primitivas de sesión sólidas y aplicadas correctamente en la gran mayoría de rutas mutantes; 3 excepciones P0 confirmadas; roles institucionales sin respaldo real de servidor. |
| Módulos | **28%** | Solo VESTA (no listado en el mandato) y ATLAS superan el 60% de completitud real; NEXUS es puramente conceptual (2%); FÉNIX está duplicado y regresivo. |
| Observabilidad | **12%** | Cero tests ejecutables en todo el repositorio (sin test runner instalado); rate limiting definido pero nunca usado; sin locks de concurrencia en jobs. |
| Preparación comercial | **20%** | No se completó una revisión legal de licencias por proveedor en esta fase (fuera del alcance verificado por los agentes de esta pasada); el hallazgo de mayor peso — ausencia de tests y de rate limiting — es en sí mismo un bloqueador comercial. Requiere una fase de auditoría legal dedicada (Fase 18 del mandato, no cubierta aquí en profundidad). |

## 4. Diez principales problemas (ordenados por impacto)

1. **3 endpoints mutantes sin autenticación** que escriben en la base de conocimiento real (`ARGUS_ENDPOINT_MATRIX.md`).
2. **`db:seed` sin protección contra la base de datos compartida**, con capacidad de borrar datos reales e insertar reportes ficticios de severidad crítica (`ARGUS_TECHNICAL_DEBT.md`).
3. **Ausencia de entidad canónica de incidente** — 5+ modelos paralelos que no se comunican (`ARGUS_DATA_FLOW.md`).
4. **`/api/incidents` (Command Center) es 100% sintético**, sin ninguna consulta a base de datos.
5. **Módulo FÉNIX duplicado y regresivo** — el menú dirige a la versión simulada, no al motor real con RBAC.
6. **Cero tests ejecutables en todo el repositorio** — ninguna garantía automática de que auth, dedup o lifecycle sigan funcionando tras un cambio.
7. **`demoDataGuard.ts`, la corrección para el incidente previo de datos falsos presentados como alerta oficial, no está comiteada** ni cubre `/api/notifications`.
8. **Ningún módulo vertical (ATLAS/VIGIA/ORÁCULO/TALOS/HERMES/ARCA) usa el pipeline real de ingesta multi-fuente** — solo ven reportes ciudadanos.
9. **Roles institucionales (POLICE/AUTHORITY/etc.) sin respaldo real de servidor** — la "restricción" de CUSTOS/NEXUS es cosmética.
10. **Rate limiting completamente definido pero nunca activado** en ningún endpoint, incluidos los 3 sin autenticación.

## 5. Diez fortalezas reales (basadas en código existente)

1. Global Watch: pipeline de ingestión real, programado, con deduplicación por clave geo-temporal y upsert idempotente para 8 fuentes de primer nivel.
2. Mapa 2D y Orbit 3D **comparten genuinamente una única fuente de datos** (`ArgusEvent`) — no son sistemas paralelos, contrario a un riesgo conocido que se temía confirmar.
3. Resolución de geometría administrativa real (no bbox) para regiones chilenas, con fuente ADM1 licenciada (geoBoundaries/BCN/OCHA).
4. Autenticación de sesión sólida: cookie HMAC-firmada, sin fallback inseguro, con fallo ruidoso si falta el secreto.
5. Guards de autorización (`requireAuth`/`requireOperator`/`requireAdmin`) aplicados correctamente en la gran mayoría de rutas sensibles (VESTA, reportes, ayuda, sanciones, revisión de conocimiento).
6. `demoDataGuard.ts` está bien diseñado conceptualmente — mecanismo de dos niveles (palabras fuertes en texto libre, palabras débiles solo en campos estructurales) que evita falsos positivos.
7. VESTA es un módulo genuinamente cercano a producción, con CRUD real, auditoría persistida de verdad y puente real a TALOS.
8. Cron secrets (`CRON_SECRET`/`ARGUS_CRON_SECRET`) son consistentes entre los dos workflows, fail-closed, sin discrepancia funcional real.
9. Sin secretos hardcodeados ni fugas de stack trace en ningún endpoint muestreado.
10. Canonicalización de severidad GDACS (release v1.0.3.2) demuestra que el equipo sí corrige clasificaciones erróneas de forma dirigida cuando se detectan.

## 6. Riesgos

- **Legal/comercial**: no verificado en esta fase — requiere revisión dedicada de licencias por proveedor antes de cualquier oferta comercial.
- **Seguridad**: los 3 endpoints P0 y la ausencia total de rate limiting son el riesgo de mayor severidad activo hoy.
- **Confianza del dato**: la fuga potencial de datos demo no gateados en `/api/notifications`, y la ausencia de protección de `db:seed`, son riesgos de la categoría "información falsa presentada como real" que el mandato clasifica como P0 por definición.
- **Continuidad operacional**: cero tests significa que cualquier cambio futuro puede romper silenciosamente auth, dedup o lifecycle sin que nadie lo note antes de producción.

## 7. Brechas

Ver `ARGUS_MASTER_BACKLOG.md` para el listado completo P0-P3 con criterios de aceptación. Las brechas de mayor peso estructural son la falta de entidad canónica de incidente y la falta de middleware de autenticación centralizado (cada ruta repite su propio guard, lo cual ya produjo los 3 endpoints P0).

## 8. Conclusiones

ARGUS ha crecido por acumulación de capacidades reales pero desconectadas. La plataforma **sí cumple parcialmente** su ciclo operacional completo, pero solo dentro de un subconjunto (Global Watch → mapa), y ese subconjunto convive con al menos tres universos de datos paralelos (reportes ciudadanos, Command Center sintético, ATLAS-conflictos estático) que un usuario no puede distinguir visualmente entre sí sin leer el código. La prioridad no es agregar más fuentes o módulos — es unificar lo que ya existe y cerrar los riesgos de seguridad/confianza de datos ya identificados.

## 9. Bloqueadores de producción (concretos)

1. Los 3 endpoints P0 sin autenticación.
2. `db:seed` sin guard contra base de datos compartida.
3. `demoDataGuard.ts` no comiteado y con cobertura incompleta.
4. Cero tests ejecutables — ningún cambio futuro tiene red de seguridad automática.
5. Ausencia de rate limiting en cualquier endpoint.

## 10. Recomendación de siguiente etapa (una sola, no en paralelo)

**Etapa única recomendada: "Cerrar y Unificar" — resolver los 8 ítems P0 del backlog maestro (autenticación de los 3 endpoints, guard de `db:seed`, comiteo de `demoDataGuard.ts` con cobertura completa, diseño de la entidad canónica de incidente, decisión sobre `/api/incidents`, resolución de la duplicación de FÉNIX, y retiro del override de roles institucionales de demo en producción) antes de iniciar cualquier fuente, módulo o funcionalidad nueva.**

No se recomienda trabajar en paralelo en expansión de fuentes, nuevos módulos, ni mejoras visuales hasta que esta etapa esté cerrada — es exactamente la secuencia que pide el mandato: ordenar → conectar → asegurar → validar → simplificar → observar → recién después expandir.

## 11. Gobernanza futura de ARGUS

A partir de esta auditoría, toda nueva tarea debe evaluarse contra estas 10 preguntas antes de aceptarse:

1. ¿Qué problema resuelve, de los ya documentados en `ARGUS_MASTER_BACKLOG.md`, o es una capacidad nueva?
2. ¿Qué parte del ciclo operacional (detectar→validar→correlacionar→clasificar→localizar→evaluar→recomendar→notificar→seguir→cerrar→aprender) cubre?
3. ¿Qué modelo de datos usa — es el modelo canónico (una vez definido en P0.5) o crea un sexto sistema paralelo?
4. ¿Qué fuente respalda la información — real, seed, demo, o simulada, y está etiquetada como tal?
5. ¿Qué módulo consume el resultado, y ese módulo ya está conectado al pipeline real o es otro dashboard aislado?
6. ¿Qué permisos requiere, y usa las primitivas ya existentes (`requireAuth`/`requireOperator`/`requireAdmin`) en vez de reinventar el gate?
7. ¿Cómo se prueba — existe un test ejecutable, dado que hoy no hay ninguno?
8. ¿Cómo se observa — health check, log, métrica?
9. ¿Cómo se documenta — actualiza alguno de los 8 documentos de esta auditoría o el changelog?
10. ¿Duplica algo existente de los ya catalogados en `ARGUS_TECHNICAL_DEBT.md`?

Cada nueva funcionalidad debe declarar explícitamente: propietario técnico, estado, dependencias, criterio de aceptación, plan de pruebas, documentación afectada, integración con el modelo canónico (una vez exista), y si corresponde, entrada en el changelog.
