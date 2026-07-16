# ARGUS — verificación de Prompts 1–20

Estados se basan en código y ejecución del 2026-07-15, no en existencia de documentos.

| Prompt | Objetivo | Implementado | Verificado | Estado | Evidencia |
|---:|---|---:|---:|---|---|
| 1 | Endpoints mutantes | Sí | Sí | CLOSED_VERIFIED | Los tres originales usan `requireOperator`; tests P0 prueban anónimo/ciudadano/operador y no ejecución. |
| 2 | Seed guard | Sí | Sí | CLOSED_VERIFIED | Guard previo a Prisma, fail-closed y 21 casos dentro de `seed-guard.test.ts`; seed no ejecutado. |
| 3 | Demo notifications | Sí | Sí | CLOSED_VERIFIED | `isDemoDataAllowed`, degradación taxonómica y tests; la regresión demo está en mapa, no en notifications. |
| 4 | Vitest | Sí | Sí | CLOSED_VERIFIED | 75 archivos, 839 tests; red bloqueada globalmente. |
| 5 | Roles institucionales | Parcial | Sí | CLOSED_PARTIAL | Override demo bloqueado en producción y APIs resuelven sesión server-side; roles institucionales no existen en sesión real. |
| 6 | Command Center | Sí | Sí | CLOSED_VERIFIED | Modo sintético queda demo-disabled en producción; tests P0 pasan. No se considera capacidad operacional. |
| 7 | FÉNIX | Sí | Sí | CLOSED_VERIFIED | `/modules/fenix` usa `FenixOfficialGate`/`FenixTwinPanel`; guard server de acciones y tests pasan. |
| 8 | Diseño canónico | Parcial | Sí | CLOSED_PARTIAL | Diseño y `KnowledgeIncident` existen; no hay modelo/identidad universal ni migración de modelos paralelos. |
| 9 | Mapeador único | Sí | Sí | CLOSED_VERIFIED | Wrappers delegan en `canonicalKnowledgeIncidentToArgusEvent`; tests de igualdad de endpoints pasan. |
| 10 | Lifecycle | Sí | Sí | CLOSED_VERIFIED | Política común, terminales/expiry antes de límites y suites lifecycle pasan. Sigue almacenado en JSON/vocabularios paralelos. |
| 11 | Notificaciones | Sí | Sí | CLOSED_VERIFIED | Taxonomía, slots, severidad/verificación, demo guard y contador operacional probados. Infra productiva no verificada. |
| 12 | Rate limiting | Parcial | Sí | CLOSED_PARTIAL | Backend distribuido/fail-closed y 17 rutas cubiertas; 151 rutas sin helper y producción Upstash desconocida. |
| 13 | Locks | Parcial | Sí | CLOSED_PARTIAL | SET NX PX/token/TTL/finally y tests concurrencia; idempotencia no dura tras release. |
| 14 | SENAPRED | Parcial | Sí | REGRESSED | Cliente/normalizador/persistencia compartidos, pero dos workflows siguen consultando en secuencia y debug live es público. |
| 15 | Wildfire | Sí | Sí | CLOSED_VERIFIED | Perfil, geometría, fusión/no falsa fusión y persistencia cross-run cubiertos con tests; producción no verificada. |
| 16 | Fuentes | Parcial | Sí | CLOSED_PARTIAL | Registry de 43, scheduler y health; solo 8 scheduled, 18 manual, 15 disabled y cero ejecución prod comprobada. |
| 17 | Módulos principales | Parcial | Sí | REGRESSED | Gateway canónico/RBAC y tests existen; integración aditiva conserva legacy y causó build roto en `/dashboard`. |
| 18 | Módulos secundarios | Parcial | Sí | CLOSED_PARTIAL | Madurez/notas y algunos gates; ARCA/HERMES/AURA siguen demo/parcial, CUSTOS preview, NEXUS planned. |
| 19 | Observabilidad | Parcial | Sí | CLOSED_PARTIAL | Health público, snapshot operador, redacción y tests; sin sink/alertas/retención externa. |
| 20 | Deuda técnica | Parcial | Sí | CLOSED_PARTIAL | Amplia eliminación/reubicación de legacy y tests; quedan fragmentación, registries duplicados, scripts y build regresado. |

## Resumen

| Estado | Cantidad | Prompts |
|---|---:|---|
| CLOSED_VERIFIED | 10 | 1, 2, 3, 4, 6, 7, 9, 10, 11, 15 |
| CLOSED_PARTIAL | 8 | 5, 8, 12, 13, 16, 18, 19, 20 |
| REGRESSED | 2 | 14, 17 |
| OPEN | 0 | — |

## Regresiones verificadas

1. **Prompt 14:** el cliente se consolidó, pero no el propietario programado; locks no eliminan duplicación secuencial.
2. **Prompt 17:** `useSearchParams()` añadido a `AtlasDashboard` quedó envuelto en `/modules/atlas`, no en `/dashboard`; el build falla.
3. **Secuencia transversal:** el guard demo se aplicó a APIs/notificaciones, pero el cliente del mapa mantiene un bypass directo a `demoArgusEvents`.

## Calidad de prueba

Las suites son deterministas y sin red, pero demuestran comportamiento de código con mocks. No demuestran credenciales, Redis, Supabase, GitHub Actions, Vercel, proveedores, carga ni dispositivos reales.
