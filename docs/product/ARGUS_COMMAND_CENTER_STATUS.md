# ARGUS — Estado Real del Command Center (`/api/incidents`, `/api/command/overview`)

> Resuelve el hallazgo P0 de la auditoría (`docs/audit/ARGUS_MASTER_BACKLOG.md`, ítem P0.6): `/api/incidents` no ejecuta ninguna consulta a base de datos y puede presentarse como una fuente operacional real. **Este documento NO anuncia que el Command Center quedó operativo — declara que quedó contenido y correctamente etiquetado**, a la espera de una futura entidad canónica de incidente.

## 1. Qué es actualmente `/api/incidents`

Un endpoint de solo lectura (`GET` únicamente, sin acciones mutantes) que combina cuatro fuentes, ninguna de las cuales es una fuente operacional persistida:

1. `buildDemoIncidents()` (`src/lib/command/incidentBuilder.ts`) — un incidente hardcodeado ("Incendio urbano demo cerca de infraestructura crítica") o, si se le pasan eventos reales (nadie lo hace hoy), los convierte igual con `isDemo:true`.
2. Clusters de `src/lib/quakesense/quakesenseMemoryStore.ts` — un store `globalThis`, mezcla de señales demo estáticas y señales "en vivo" enviadas por dispositivos, ninguna persistida.
3. Safety checks de `src/lib/mobile-safety/mobileSafetyService.ts` — mismo patrón, in-memory.
4. Detecciones de `src/lib/sensor-safety/sensorSafetyStore.ts` — mismo patrón, in-memory, semilla demo + detecciones creadas en runtime.

`/api/command/overview` (el "Command Center" propiamente dicho) construía, antes de esta tarea, **exactamente la misma combinación de forma duplicada e independiente** — ahora ambos usan la misma función centralizada `getCommandCenterIncidents()`.

**Hallazgo adicional durante esta tarea**: `src/components/command/CommandCenterPanel.tsx` — renderizado dentro de `AtlasDashboard.tsx`, es decir, visible para operadores/administradores reales de ATLAS — llamaba a `buildDemoIncidents()` **directamente en el cliente**, sin ningún gate, y asumía `incidents[0]` siempre existente (fallaría con `undefined` si la lista estuviera vacía). Este era, en la práctica, el consumidor real más expuesto — más que las rutas API, que hoy no tienen ningún consumidor de frontend (`/api/incidents` y `/api/command/overview` no se referencian desde ningún componente por URL).

## 2. Fuentes: cuáles son sintéticas, cuáles viven en memoria

| Origen | Archivo | Persistencia | Fuente real | `dataMode` asignado |
|---|---|---|---|---|
| `buildDemoIncidents()` | `src/lib/command/incidentBuilder.ts` | Ninguna | No | `"demo"` |
| Clusters QuakeSense | `src/lib/quakesense/quakesenseMemoryStore.ts` + `quakesenseIncidentAdapter.ts` | Memoria (`globalThis.__argusQuakeSenseSignals`) | Parcial (mezcla demo + señales de dispositivo, ninguna persistida) | `"runtime_placeholder"` |
| Safety checks móviles | `src/lib/mobile-safety/mobileSafetyService.ts` + `mobileSafetyIncidentAdapter.ts` | Memoria | No (siempre `isDemo:true` en el adaptador) | `"runtime_placeholder"` |
| Detecciones Sensor Safety | `src/lib/sensor-safety/sensorSafetyStore.ts` (`globalStore.__argusSensorSafetyStore`) + `sensorSafetyIncidentAdapter.ts` | Memoria | Parcial (semilla demo + detecciones runtime) | `"runtime_placeholder"` |

Ningún origen produce hoy `dataMode: "operational"`. Ese valor existe en el tipo (`IncidentDataMode`, `src/types/incident.ts`) únicamente como valor futuro — nada en el código lo construye todavía.

## 3. Por qué no es operacional

- No consulta Prisma.
- No consume `KnowledgeIncident` ni el pipeline de Global Watch.
- No usa una entidad canónica de incidente (la auditoría ya documentó que ARGUS tiene 5+ modelos de incidente paralelos — este es uno de ellos, el más aislado).
- No pasa por deduplicación, lifecycle, trazabilidad ni cierre real.
- Los stores en memoria (`globalThis`) se reinician en cada redeploy/cold start y **no necesariamente se comparten entre instancias serverless** — dos requests concurrentes podrían ver estados distintos.

## 4. Comportamiento en producción

- **Sin `ARGUS_ALLOW_DEMO_DATA=true`** (el estado por defecto en cualquier despliegue de producción): `getCommandCenterIncidents()` retorna `{ mode: "demo-disabled", operational: false, incidents: [] }` **sin siquiera invocar** `buildDemoIncidents()` ni leer los stores en memoria — no hay riesgo de que un filtro downstream deje pasar algo por error, porque no hay nada que filtrar.
- `/api/incidents` responde `200` con `incidents: []`, `operational: false`, `mode: "demo-disabled"` y un mensaje explícito. Nunca `500`.
- `/api/incidents/[id]` responde `404` con el mismo mensaje.
- `/api/command/overview` responde con `totalActiveIncidents: 0`, todos los `priorityCounts` en cero, `topIncidents: []`, y un `systemAlerts` que dice explícitamente "Sin fuente operacional conectada."
- `CommandCenterPanel.tsx` (dentro de ATLAS) muestra: "Command Center sin fuente operacional conectada. Datos de demostración desactivados en este entorno." — sin badge `Demo`, sin tarjetas de incidentes.

## 5. Comportamiento en modo demo (`ARGUS_ALLOW_DEMO_DATA=true`, o fuera de producción por defecto)

- Los cuatro orígenes se combinan como antes, pero **cada incidente** ahora declara `dataMode` (`"demo"` o `"runtime_placeholder"`), `persistent: false`, `severityMode: "simulated"`, además del `isDemo` ya existente.
- La respuesta de nivel superior siempre incluye `operational: false` y `mode: "demo"` — nunca `"operational": true`, sin importar cuántos incidentes haya.
- `CommandCenterPanel.tsx` muestra el badge `Demo` visible en el encabezado, y `IncidentCommandCard` usa una etiqueta neutral según el modo ("Incidente de demostración" / "Señal preliminar (no persistente)") en vez del anterior "Incidente operativo" fijo y engañoso.
- Los contadores (`CommandOverviewCards`, `priorityCounts` de `/api/command/overview`) sí reflejan los datos demo en este modo — es el comportamiento esperado y etiquetado, no un error.

## 6. Limitaciones (explícitas, no ocultas)

- Reutiliza `isDemoDataAllowed()`/`ARGUS_ALLOW_DEMO_DATA` (no se creó una segunda variable) — esto significa que la misma bandera que habilita datos demo en Global Watch/Chile alerts también habilita estos incidentes sintéticos. Si en el futuro se necesita desacoplarlos, requerirá una decisión explícita, no un descuido.
- `buildDemoIncidents(events)` acepta un parámetro `events` que, si se le pasaran eventos reales, los seguiría marcando `isDemo:true`/`dataMode:"demo"` incorrectamente — hoy esto es código muerto (ningún llamador pasa `events`), documentado aquí como deuda latente, no corregido en esta tarea por estar fuera de su alcance.
- Los stores en memoria no tienen ninguna acción mutante expuesta a través de `/api/incidents` (confirmado: solo `GET` en ambas rutas) — las rutas que sí escriben en esos stores (`/api/quakesense/*`, `/api/sensor-safety/*`, `/api/mobile-safety/*`) son features de producto independientes, ya con su propia documentación, y no fueron tocadas en esta tarea.

## 7. Qué falta para conectar esto a la futura entidad canónica

1. Definir la entidad canónica de incidente (trabajo pendiente documentado en `docs/audit/ARGUS_MASTER_BACKLOG.md`, ítem P0.5) — este endpoint deliberadamente NO se conectó a `KnowledgeIncident` en esta tarea, para no crear un sexto flujo paralelo antes de que exista ese diseño.
2. Decidir si QuakeSense/Mobile Safety/Sensor Safety pasan a persistir en una tabla real, y con qué lifecycle.
3. Decidir si `/api/incidents` sigue existiendo como endpoint separado o se fusiona con `/api/vigia/events`/`/api/chile-alerts` una vez exista la entidad canónica.
4. Diseñar autenticación/autorización para cualquier futura acción mutante sobre incidentes reales (crear, confirmar, cerrar) — hoy no existe ninguna, y no debe agregarse hasta que haya una fuente real detrás.
