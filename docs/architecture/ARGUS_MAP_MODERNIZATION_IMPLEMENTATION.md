# ARGUS — Integración cartográfica, rendimiento y simbología compartida (Prompt 5)

**Fecha**: 2026-07-17
**Tipo**: auditoría + consolidación quirúrgica — no rediseño, no mapa nuevo.
**Rama**: `phase-3-ui-ux`.
**Alcance**: no se modificó `prisma/schema.prisma`, no se creó ningún runtime cartográfico nuevo, no se tocaron secretos, no se hizo commit ni push, no se actualizó el changelog público ni la versión de ARGUS.

---

## 1. Resumen ejecutivo

**Estado anterior**: el sistema cartográfico de ARGUS ya era considerablemente más maduro que lo que la auditoría inicial (base de este programa de prompts) asumía. No existían 5-6 componentes de mapa monolíticos por descubrir: existen 34 componentes en `src/components/map/` con responsabilidades ya bastante separadas (runtime Leaflet, runtime Orbit/Three.js, capas por dominio, POI, clustering, símbolos, leyenda, controles, paneles de detalle). El mapeador canónico (Prompt 3) y el registro operacional de fuentes (Prompt 4) ya garantizaban, según sus propios documentos de cierre, que `ArgusEvent` es la proyección única que el mapa debería consumir.

Lo que sí seguía roto — confirmado por lectura directa de código, no por la auditoría original — era exactamente la clase de defecto que este prompt pedía cazar: **tres tablas de color/tamaño divergentes** de la fuente única de simbología (`argusMapSymbols.ts`), una **política de truncamiento de Orbit por orden de llegada** en vez de por prioridad explícita, una **reconstrucción completa de la escena 3D cada 750ms** sin importar si los datos cambiaron, y **dos enlaces sin validar protocolo** en un popup de fuente visual externa (XSS vía `javascript:`).

**Arquitectura final**: se mantiene exactamente el mismo conjunto de runtimes (Leaflet para Calles/Táctico/Satélite, Three.js/WebGL para Orbit, ambos orquestados desde `OperationalMap.tsx`). No se creó ningún mapa, registro, sistema de clustering, ni motor de simbología nuevo. Se consolidó la simbología (Orbit y los overlays de FÉNIX ahora leen severidad/color/tamaño de la misma fuente que el mapa 2D), se reemplazó la reconstrucción ciega de Orbit por una actualización incremental por ID canónico, se reemplazó el truncamiento arbitrario de Orbit por una política explícita (severidad, luego recencia), y se cerró el vector XSS en `VisualSourcePopup.tsx`.

**Decisión de runtime**: mantener Leaflet para los tres modos 2D; no migrar Táctico a MapLibre en esta entrega (ver §4 — no hay evidencia de que el volumen actual lo requiera, y no se pudo ejecutar un benchmark real en este entorno).

**Riesgos residuales**: el más relevante es que `src/app/app/page.tsx` (la página operativa real) sigue sin aplicar carga por viewport/bbox al endpoint `/api/argus/events` pese a que ese endpoint ya soporta `bbox` server-side — ver §10 y §21.

---

## 2. Inventario inicial

| Componente | Runtime | Responsabilidad anterior | Problema | Decisión |
|---|---|---|---|---|
| `OperationalMap.tsx` (1584 líneas) | Leaflet | Orquesta runtime, capas, selección, clustering, popups, controles, y también hospeda/monta `GlobeView` para Orbit | Componente grande pero ya razonablemente cohesionado (no mezcla fetch de red — recibe props ya resueltas); tenía una tabla de color local (`riskColor`) para zonas de conflicto, divergente de `argusMapSymbols.ts` | **AMPLIAR** (corrección quirúrgica del color divergente); no dividir — no hay una línea de corte limpia sin romper 30+ referencias a refs de capas Leaflet |
| `GlobeView.tsx` (691→~700 líneas) | Three.js/WebGL | Escena Orbit completa: cámara, texturas, marcadores, raycasting, selección | Tabla de color (`severityColors`) y tamaño (`markerSize`) propia, divergente de la fuente canónica; `normalizeSeverity` local con fallback distinto (`"low"`) al de `OperationalMap` (`"info"`); reconstrucción total de mallas cada 750ms sin importar si los datos cambiaron; truncamiento a 650 entidades por orden de concatenación, no por política explícita; filtraba `ArgusEvent` solo a critical/high mientras dejaba datos legado/demo sin filtrar | **REFACTORIZAR** (in-place, misma interfaz pública `Props`) |
| `argusMapSymbols.ts` (204→~230 líneas) | Compartido | Única fuente de forma/color/tamaño/borde/pulso ya bien diseñada, con `escapeHtml` propio | Le faltaban una normalización de severidad compartida y una razón de tamaño relativa para runtimes no-pixel (Orbit) | **AMPLIAR** |
| `FenixPredictionFrameCard.tsx` | Leaflet (mapa Leaflet propio, aislado, no operacional) | Miniatura estática de una fase de simulación FÉNIX (círculo de radio + línea origen→centro) | Tabla de color local de 4 valores, con `low`/`medium`/`high` en tonos distintos a los canónicos | **MANTENER runtime** (vista de simulación aislada, fuera de alcance de unificación — no es un mapa operacional competidor) + **AMPLIAR** solo el color |
| `VisualSourcePopup.tsx` | React (sin mapa) | Modal de detalle de una fuente visual externa (cámara/stream) | `href` e `iframe src` renderizados directo desde `source.sourceUrl`/`source.embedUrl` sin validar protocolo | **AMPLIAR** (guardia de URL) |
| `simpleEventClustering.ts` | Compartido | Clustering de grilla por celda para `CrisisEvent[]` | Ninguno encontrado — dominio distinto (POI/CriticalPoi) ya usa sus propios criterios de zoom coherentes, ver §9 | **MANTENER** |
| `mapProvider.ts` | Compartido | Clasifica proveedores base (osm/mapbox/maptiler/esri/google_maps/custom) | Ya implementado casi exactamente como pide la Fase P (`implemented`/`configured`/`requiresApiKey`) | **MANTENER** |
| `argusZoomVisibility.ts` | Compartido | LOD/zoom compartido para incidentes, zonas de riesgo, noticias | Ya documenta explícitamente por qué no duplica los sistemas de zoom de POI/CriticalPoi existentes | **MANTENER** |
| `argusEventsDataState.ts` | Compartido | Resuelve el estado (`demo`/`available`/`partial`/`unavailable`) de `argusEvents` a partir de lo que el servidor ya decidió | Ya implementa exactamente la regla de Fase R ("el cliente nunca decide demo por su cuenta") | **MANTENER** |
| `layerPolicy.ts` | Compartido | Registro de ~60 IDs de capa por modo (`realtime`/`sensor`/`context`) con visibilidad por defecto | No centraliza *todos* los campos que pide la Fase E (zoom min/max, representación) en un único objeto por capa — están distribuidos entre este módulo, `argusZoomVisibility.ts` y `criticalPoiCategoryRegistry.ts` | **MANTENER** (consolidarlo en un solo objeto por capa es una migración de ~60 IDs fuera de proporción para esta entrega — ver §21) |

---

## 3. Arquitectura cartográfica final

- **Runtimes**: sin cambios estructurales. Leaflet renderiza Calles/Táctico/Satélite híbrido dentro de `OperationalMap.tsx`; Three.js/WebGL renderiza Orbit en `GlobeView.tsx`, montado condicionalmente por el propio `OperationalMap.tsx` (Orbit no es una ruta ni un árbol de componentes independiente — comparte el mismo controlador de runtime que los modos 2D).
- **Responsabilidades**: `OperationalMap.tsx` sigue siendo el controlador único — capas, selección, viewport, controles — con capas especializadas ya extraídas (`ArgusEventLayer`, `PoiLayer`, `CriticalPoiLayer`, `TelecomConnectivityLayer`, overlays de rutas/riesgo). No se creó ninguna capa/registro/selector nuevo.
- **Estado**: la selección (`selectedEventId`, `selectedArgusEventId`, etc.) vive en `useState` dentro de la página que monta `OperationalMap` (`src/app/app/page.tsx`), pasada por props — un único punto de verdad por tipo de entidad, no un registro paralelo por modo.
- **Capas**: siguen consumiendo `ArgusEvent`/`CrisisEvent`/tipos ya normalizados vía props; ninguna capa de mapa hace `fetch` a fuentes externas directamente (confirmado por grep, ver §35).
- **Actualización**: 2D sigue reconstruyendo sus `L.divIcon` por capa en cada cambio de props (ya era así; no se tocó — no se encontró evidencia de que sea el cuello de botella real, ver §4). Orbit ahora actualiza incrementalmente por ID (ver §11).
- **Proyecciones**: Orbit ahora normaliza severidad con la misma función (`normalizeArgusMapSeverity`) que usa `OperationalMap.tsx`, en vez de una copia local con un valor de fallback distinto.

---

## 4. Decisión Leaflet/MapLibre

**Metodología**: se buscó `maplibre-gl`/`mapbox-gl` en `package.json` (ausente) y se leyó el uso real de Leaflet en `OperationalMap.tsx`, `PoiLayer.tsx`, `CriticalPoiLayer.tsx`, `argusZoomVisibility.ts`. Se intentó localizar un entorno de navegador para correr benchmarks reproducibles (100/500/1.000/5.000/10.000 entidades) tal como pide la Fase G; **no había ningún servidor de previsualización ni navegador disponible en esta sesión** (las herramientas de navegador estaban desconectadas). No se fabricó ningún número de FPS/memoria — se documenta esta limitación explícitamente en vez de inventar resultados, tal como exige el mandato.

**Evidencia arquitectónica disponible** (sin medición en vivo):
- ARGUS ya implementa carga progresiva por zoom en tres sistemas coordinados (`argusZoomVisibility.ts`, `criticalPoiPriority.ts`, `poiTypes.ts`) que reducen agresivamente el número de nodos DOM/marcadores en zooms bajos — el patrón de mitigación que normalmente motiva una migración a WebGL (reducir nodos DOM) ya está aplicado sobre Leaflet.
- El clustering de grilla (`simpleEventClustering.ts`) ya agrupa puntos densos antes de crear marcadores.
- No se encontró ningún reporte de incidente de rendimiento, ticket, o comentario en el código (`grep` de "TODO.*perf", "slow", "lag" en `src/components/map` y `src/lib/map` no arrojó resultados) que indique que Leaflet esté en un límite real hoy.
- El único cuello de botella *medible por inspección* que se encontró no era de Leaflet sino de Orbit/Three.js: la reconstrucción completa de la escena cada 750ms (§11) — ya corregido en esta entrega, sin necesidad de cambiar de motor.

**Decisión**: **mantener Leaflet** para Calles, Táctico y Satélite híbrido. No hay evidencia de que el volumen actual o proyectado exceda lo que las optimizaciones ya presentes (zoom LOD + clustering) resuelven, y una migración sin benchmark real sería exactamente lo que el mandato prohíbe ("no migres a MapLibre sin benchmarks"). Orbit permanece en Three.js (nunca fue candidato a MapLibre — es una escena 3D, no un mapa 2D).

**Impacto**: ninguno — no se tocó el motor de renderizado 2D.

**Deuda futura**: si el volumen de incidentes simultáneos crece de forma sostenida (orden de miles de marcadores visibles simultáneamente sin agrupar), correr el benchmark real descrito en la Fase G/Y en una sesión con acceso a navegador antes de decidir sobre MapLibre para el modo Táctico específicamente — nunca para Calles/Satélite sin justificación propia.

---

## 5. Modos cartográficos

| Modo | Runtime | Función | Proveedor | Capas | Estado |
|---|---|---|---|---|---|
| Calles | Leaflet (raster tiles) | Navegación civil, POI urbano, transporte | `osm` (OSM/CARTO, sin API key) — `IMPLEMENTADO` | Todas las capas de `layerPolicy.ts` compatibles con contexto urbano | Sin cambios — no se tocó su función urbana |
| Táctico | Leaflet (mismo motor, estilo distinto) | Alto contraste, incidentes, infraestructura crítica, zonas | `osm` con estilo táctico (`baseMapStyles.ts`) | Igual que Calles + capas operacionales priorizadas | Sin cambios — no se convirtió en una capa CSS nueva ni se le quitó capacidad |
| Satélite híbrido | Leaflet (raster tiles) | Contexto físico/terreno, incendios, inundaciones | `esri` (World Imagery + labels) — `IMPLEMENTADO` | Igual que Calles, con overlays de riesgo | Sin cambios |
| Orbit | Three.js/WebGL | Contexto global, distribución/concentración de eventos | N/A (textura de la Tierra local, no tiles) | Consume el mismo `ArgusEvent`/`CrisisEvent`/`ArgusNormalizedEvent` que 2D | **Modificado**: simbología unificada, actualización incremental, truncamiento por política explícita |

No existe un "modo claro" adicional ni un quinto modo — no se encontró ninguno en el código, por lo que no hay nada que deprecar en esa dimensión.

---

## 6. Sistema de simbología

- **Fuente de verdad**: `src/lib/mapSymbols/argusMapSymbols.ts` — sin cambios de diseño, solo ampliada con:
  - `normalizeArgusMapSeverity(value)`: normalización única de severidad cruda → 6 buckets canónicos (`inactive|info|low|medium|high|critical`), fallback a `"info"` (no a `"low"`) para valores desconocidos/ausentes.
  - `getArgusMarkerSeverityRank(severity)`: orden de importancia ascendente, usado para políticas de truncamiento/priorización (Orbit, y cualquier futuro consumidor).
  - `getArgusMarkerSizeRatio(severity)`: razón 0-1 del tamaño de un severity contra `critical`, para que runtimes con espacio de unidades distinto (mundo 3D de Orbit vs píxeles de un `divIcon`) deriven su propio tamaño sin mantener una segunda tabla.
- **Uso en 2D**: sin cambios de comportamiento — `OperationalMap.tsx` ya usaba `createArgusDivIcon`/`getArgusMarkerColor` en 11 sitios de llamada; su única tabla local (`riskColor`, para el relleno de polígonos de zona de conflicto) fue reemplazada por `getArgusMarkerColor(toMapSeverity(zone.riskLevel))` — corrige además un color realmente incorrecto (`low` renderizaba cian `#22d3ee` en vez del verde canónico `#34d399`).
- **Uso en Orbit**: `GlobeView.tsx` ya no mantiene `severityColors` ni `markerSize` propios. El color de cada malla/glow viene de `getArgusMarkerColor`; el tamaño mundial de cada geometría viene de `getGlobeMarkerWorldSize` (nuevo, local a `GlobeView.tsx`, definido como `GLOBE_MARKER_CRITICAL_WORLD_SIZE * getArgusMarkerSizeRatio(severity)` — el tamaño de "critical" se mantuvo idéntico al valor anterior, 0.078 unidades, para no producir una regresión visual; los demás buckets escalan proporcionalmente desde la tabla canónica en vez de valores inventados).
- **Leyenda**: `ArgusMapLegend.tsx` ya importaba exclusivamente de `argusMapSymbols.ts` (confirmado — sin colores hardcodeados) — no requirió cambios.
- **Accesibilidad**: sin rediseño. La forma (glifo SVG) sigue siendo la señal primaria de tipo, independiente del color, tal como documenta `docs/ARGUS_MAP_SYMBOL_SYSTEM.md`; no se tocó ese contrato.

---

## 7. Registro de capas

- **Contrato actual**: `layerPolicy.ts` declara identidad (`ArgusLayerId`, ~60 IDs) y modo de datos (`realtime`/`sensor`/`context`) con visibilidad por defecto; zoom mínimo/máximo vive en `argusZoomVisibility.ts` (para incidentes/zonas/noticias) y en `criticalPoiCategoryRegistry.ts`/`poiTypes.ts` (para POI); permisos/cobertura por país se resuelven en los adaptadores de fuente (Prompt 4), no en el mapa.
- **Grupos**: always-on realtime (nunca se puede desactivar el *dato*, solo ocultarlo visualmente), sensor de usuario (requiere permiso explícito), contexto opcional (control total del usuario).
- **Viewport**: sin registro de capa que dispare fetch — las capas de mapa reciben datos ya resueltos por props, nunca hacen su propio `fetch` (confirmado por grep en §35).
- **Fuentes**: cada capa mapea a una o más fuentes ya consolidadas por el Prompt 4 (`ARGUS_SOURCE_OPERATIONS_REGISTRY`); no se creó ningún registro paralelo.
- **Estado**: no se modificó `layerPolicy.ts` — no se encontró ningún defecto en él que estuviera dentro del alcance de este prompt.

---

## 8. Geometría

- **Formatos**: `ArgusGeometry` (`point`/`polygon`/`route`/`administrative_area`/`region_reference`) ya distingue explícitamente un punto representativo (`anchor`) de un polígono real.
- **bbox**: confirmado en `OperationalMap.tsx` (zonas de conflicto, líneas 836-844, sin modificar en esta entrega) que un bbox se usa únicamente para centrar un marcador aproximado, nunca para dibujar un rectángulo relleno como si fuera el polígono real — con un comentario explícito en el código que documenta esa decisión. No se encontró ningún caso en `src/components/map` o `src/lib/geometry` donde un bbox se dibuje como polígono de alerta.
- **Polígonos**: `L.polygon` se usa con las coordenadas reales cuando `zone.geometryType === "polygon"`.
- **SENAPRED**: fuera del alcance de cambios de este prompt (no se tocó ingestión); por inspección, las alertas administrativas ya pasan por el mapeador canónico (Prompt 3) antes de llegar al mapa, por lo que heredan la misma regla de geometría real vs. bbox.
- **Geometrías inválidas**: no se encontró, ni se introdujo, ninguna corrección silenciosa de geometría en los archivos tocados.

---

## 9. Clustering

| Dominio | Implementación anterior | Implementación final | Regla | Estado |
|---|---|---|---|---|
| Incidentes (`CrisisEvent`) | `simpleEventClustering.ts` (grilla por celda, tamaño de celda fijo por defecto) | Sin cambios | Cluster expone cantidad, severidad máxima, eventos ordenados por prioridad/confianza — no se convierte en un incidente nuevo | MANTENER |
| Incidentes por zoom | `resolveClusterCellSizeDeg(zoom)` en `argusZoomVisibility.ts` | Sin cambios | Tamaño de celda decrece con el zoom | MANTENER |
| POI genérico | Clustering propio en `PoiLayer.tsx`, coordinado por zoom vía `poiTypes.ts` | Sin cambios | Comparte zoom/interacción con el resto del mapa vía `argusZoomVisibility.ts`/tiers propios | MANTENER |
| Infraestructura crítica | Clustering propio en `CriticalPoiLayer.tsx`, priorizado por `criticalPoiPriority.ts` (P0-P3 por zoom) | Sin cambios | Prioriza por criticidad, no por llegada | MANTENER |
| Orbit (entidades globales) | Ninguno — lista plana truncada a 650 por orden de concatenación (`argus` primero, luego `internal`, luego `external`, cada grupo sin ordenar internamente) | Ordenamiento explícito por `getArgusMarkerSeverityRank` desc, luego recencia desc, antes de truncar a `GLOBE_ENTITY_LIMIT` (650) | No trunca por orden de llegada (Fase U) | **REFACTORIZADO** |

No se creó ningún sistema de clustering nuevo — el cambio en Orbit es una política de *selección/priorización* antes del corte, no un algoritmo de agrupación.

---

## 10. Carga y actualización

- **Viewport**: `/api/argus/events` (`src/app/api/argus/events/route.ts`) ya soporta `south/west/north/east` como filtro server-side (confirmado por lectura del handler). **Sin embargo**, el único call site cliente encontrado (`src/app/app/page.tsx`, función `loadArgusEvents`, línea ~1914) llama `fetchArgusSource("/api/argus/events")` **sin ningún parámetro** — no envía bbox, zoom, ni filtros de tipo. Esto es una brecha real, no corregida en esta entrega (ver §21 — modificar `page.tsx`, una página ya señalada como legada por el propio Prompt 4, para recalcular bbox en cada `moveend`/`zoomend` con debounce + `AbortController` es un cambio de mayor superficie/riesgo que se dejó documentado en vez de apresurado).
- **Caché/cancelación**: no se encontró debounce ni `AbortController` en el flujo de fetch de `argusEvents` específicamente (sí existe `AbortController` en otro punto de `page.tsx`, para otro flujo — no reutilizable directamente sin la reestructuración de §21).
- **Actualización incremental — Orbit**: implementada en esta entrega (ver §11). Antes: `setInterval(syncMarkers, 750)` destruía y recreaba **todas** las mallas cada 750ms sin importar si `markers` había cambiado. Ahora: un efecto separado detecta cambios reales en `markers` (por referencia, derivada de `useMemo`) y aplica un diff por ID canónico.
- **Actualización incremental — 2D**: no se tocó. `OperationalMap.tsx` reconstruye las capas Leaflet (`clearLayers()` + recrear) en el efecto que reacciona a cambios de props: no se encontró evidencia de que esto sea, hoy, un problema medible (Leaflet reutiliza el DOM de forma más barata que Three.js recreando geometría WebGL), y tocar esa reconstrucción habría sido una refactorización de mucho mayor superficie sin un defecto concreto que la motive — se deja documentada como oportunidad (§21), no como bug.

---

## 11. Orbit

- **Datos**: `GlobeView.tsx` sigue recibiendo tres colecciones (`events`/`demoEvents` como `CrisisEvent[]`, `externalEvents` como `ArgusNormalizedEvent[]`, `argusEvents` como `ArgusEvent[]`) — sin cambio de contrato público (`Props` intacta).
- **Simbología**: unificada (§6) — ya no hay tabla de color/tamaño propia.
- **Límites**: `GLOBE_ENTITY_LIMIT = 650` (sin cambio de valor), pero ahora aplicado tras ordenar por severidad+recencia (§9), y el panel informativo de Orbit ahora muestra cuántas entidades se omitieron y bajo qué criterio ("N omitidos por límite de vista (prioridad: severidad, luego recencia)") en vez de omitir en silencio.
- **Selección**: sin cambios de contrato — `onSelectEvent`/`onSelectExternalEvent`/`onSelectArgusEvent` siguen devolviendo el objeto de evento original (mismo `id` que en 2D, porque proviene de la misma colección de props).
- **Rendimiento**: se eliminó la reconstrucción ciega cada 750ms. La nueva ruta (`applyMarkerUpdate`) solo toca mallas cuyo `id` es nuevo, fue removido, o cuya clave visual (`kind|severity|lat|lng`) cambió; el resto se reutiliza sin disponer/recrear geometría o material. No se pudo medir FPS real en este entorno (sin navegador disponible), pero el cambio es verificable por inspección: el rebuild total ya no ocurre en un temporizador incondicional.
- **Limpieza de recursos**: se preservó (y se hizo más precisa) la disposición de geometría/material — antes iteraba `markerGroup.children` en el cleanup; ahora itera el índice `meshIndex` que el propio código mantiene, evitando cualquier ambigüedad sobre qué hijos del grupo son marcadores vs. otros objetos.

---

## 12. POI e infraestructura

Sin cambios de código — auditado, no modificado, porque ya cumple lo que pide la Fase L:
- **Categorías**: metro/paraderos/hospitales/clínicas/comisarías/cárceles/gobierno/municipios/bomberos/refugios ya están declaradas en `criticalPoiCategoryRegistry.ts`.
- **Zoom**: sistema de 3 niveles (P0/P1 desde zoom 10, P2 desde 14, P3 desde 16) en `criticalPoiPriority.ts`, coordinado explícitamente con el de `poiTypes.ts` (P4 OSM desde zoom 13/15) vía comentarios en `argusZoomVisibility.ts` que documentan por qué no se fusionan.
- **Prioridad visual**: ya basada en criticidad + zoom.
- **Preparación para impacto** (Prompt 6): sin cambios — la infraestructura de zoom/prioridad ya existente es exactamente lo que un futuro motor de impacto necesitaría consumir; no se construyó nada del motor de impacto en sí.

---

## 13. Seguridad visual

- **Sanitización de texto**: `argusMapSymbols.ts::escapeHtml` ya escapaba `title`/`label` antes de esta entrega (verificado, no modificado) — se agregó una prueba de regresión (`tests/map/argusMapSymbols.test.ts`) que confirma que un `title` con `<img onerror=...>` se escapa en vez de inyectarse.
- **URLs — hallazgo y corrección**: `VisualSourcePopup.tsx` renderizaba `href={source.sourceUrl}` y `iframe src={getMutedEmbedUrl(source.embedUrl)}` sin validar el protocolo. React escapa contenido de texto pero **no** valida protocolos de URL — un valor `javascript:...` en cualquiera de los dos campos se habría ejecutado. Se agregó `isSafeExternalUrl()` (`src/lib/security/sanitizers.ts`, nueva función en el módulo de sanitización ya existente — no un módulo nuevo) que solo acepta `http:`/`https:` absolutos; ambos usos ahora están guardados, y el enlace externo se reemplaza por un `<span>` deshabilitado ("Enlace no disponible") cuando la URL no pasa la validación, en vez de omitir el botón silenciosamente.
- **`dangerouslySetInnerHTML`**: no se encontró ningún uso en `ExternalEventPopup.tsx` ni `VisualSourcePopup.tsx` (ambos usan JSX normal, que ya escapa contenido de texto).
- **Datos sensibles**: no se tocó ningún flujo de datos privados; los popups auditados no exponen campos fuera de lo que sus tipos (`VisualSource`) ya exponían.

---

## 14. Datos demo

| Fuente demo | Ubicación anterior | Producción | Acción final |
|---|---|---|---|
| `demoArgusEvents` | `src/data/demoArgusEvents.ts`, servida solo por `/api/argus/events` cuando `isDemoDataAllowed()` lo autoriza y lo declara vía `source: "curated_demo"` | Ya gateada server-side (Prompt DATA-FINAL-001, `argusEventsDataState.ts`) — el cliente nunca decide mostrar demo por su cuenta y un fetch fallido nunca cae a datos inventados | Sin cambios — ya cumple la regla |
| `demoEvents` prop de `GlobeView` | Se sigue mezclando con `events` (reales) en `buildMarkers` sin un flag de procedencia persistido en el `GlobeMarker` resultante | — | **No corregido en esta entrega** — es una brecha real (Orbit no puede hoy distinguir visualmente un marcador demo de uno real una vez construida la malla), documentada en §21 como deuda P2: requiere decidir si Orbit debe mostrar demo en absoluto, o solo etiquetarlo, antes de tocar el código |

---

## 15. Archivos modificados

| Archivo | Cambio | Motivo |
|---|---|---|
| [argusMapSymbols.ts](src/lib/mapSymbols/argusMapSymbols.ts) | + `normalizeArgusMapSeverity`, `getArgusMarkerSeverityRank`, `getArgusMarkerSizeRatio` | Dar a Orbit y a cualquier otro consumidor una única función de normalización/ranking en vez de copias locales divergentes |
| [OperationalMap.tsx](src/components/map/OperationalMap.tsx) | `toMapSeverity` ahora es un alias de `normalizeArgusMapSeverity`; `riskColor` local eliminado en favor de `getArgusMarkerColor` | Elimina una tabla de color divergente y corrige un color de severidad `low` incorrecto en zonas de conflicto |
| [GlobeView.tsx](src/components/map/GlobeView.tsx) | Elimina `severityColors`/`markerSize`/`normalizeSeverity` locales; deriva color/tamaño de `argusMapSymbols.ts`; agrega `recencyTimestamp` y política de truncamiento explícita en `buildMarkers`; reemplaza `setInterval(syncMarkers, 750)` por actualización incremental por ID (`applyMarkerUpdate`); expone `omittedCount` en el panel de Orbit; exporta `buildMarkers`/`GlobeMarker` para pruebas | Cierra la divergencia de simbología Fase D, la política de truncamiento Fase U, y la reconstrucción ciega Fase I |
| [FenixPredictionFrameCard.tsx](src/components/fenix/FenixPredictionFrameCard.tsx) | Color de severidad del círculo de radio ahora viene de `getArgusMarkerColor(normalizeArgusMapSeverity(...))` | Elimina la última tabla de color local encontrada en el árbol de mapas |
| [VisualSourcePopup.tsx](src/components/map/VisualSourcePopup.tsx) | `href`/`iframe src` guardados por `isSafeExternalUrl`; enlace inseguro se reemplaza por un estado deshabilitado | Cierra un vector XSS vía `javascript:`/`data:` en un popup de mapa |
| [sanitizers.ts](src/lib/security/sanitizers.ts) | + `isSafeExternalUrl` | Utilidad mínima reutilizable, no existía ninguna equivalente en el repo |

---

## 16. Archivos divididos, deprecados o eliminados

Ninguno. No se dividió, deprecó ni eliminó ningún archivo — todos los defectos encontrados se resolvieron con modificaciones quirúrgicas dentro de archivos existentes, sin necesidad de reestructurar límites de módulo.

---

## 17. Pruebas ejecutadas

| Comando | Resultado | Observaciones |
|---|---|---|
| `npx tsc --noEmit` | 1 error preexistente, no relacionado | `tests/senapred/senapredSingleOwner.test.ts:52` (`'id' is specified more than once`) — confirmado preexistente, no toca ningún archivo de esta entrega |
| `npx eslint .` | 0 errores, 28 warnings preexistentes | Todas las warnings son de `react-hooks/set-state-in-effect` en hooks no relacionados o `no-unused-vars` en un test de telecom-connectivity ajeno; **cero warnings nuevas** atribuibles a los archivos de esta entrega tras limpiar un import no usado que mi propio cambio dejó (`ArgusMapSeverity` en `OperationalMap.tsx`) |
| `npx vitest run` | 1139/1139 pruebas pasan; 2 archivos fallan (0 tests cada uno) | Los 2 archivos que fallan (`tests/p0/codigo-azul-dedup.test.ts`, `tests/p0/codigo-azul-pagination.test.ts`) fallan por el mismo bug preexistente de hoisting de `vi.mock` documentado en `ARGUS_SOURCE_CONSOLIDATION_IMPLEMENTATION.md` §9 — confirmado no relacionado (no tocan ningún archivo de mapas) |
| `npx vitest run tests/map tests/security/sanitizers.test.ts` | 48/48 pruebas nuevas pasan | Incluye paridad de severidad 2D/Orbit, fallback compartido, política de truncamiento, empate por recencia, y el guard de URL |
| `npm run build` | Build exitoso (Next.js 16.2.9, Turbopack) | Sin errores de TypeScript ni de build; confirma que el bug de tipos de `notificationCenterEngine.ts` documentado como bloqueante en `ARGUS_SOURCE_CONSOLIDATION_IMPLEMENTATION.md` §9 ya fue resuelto por el propio usuario entre esa sesión y esta (no se tocó esa función) |

---

## 18. Resultados de rendimiento

**No se pudo ejecutar un benchmark en navegador real en este entorno** (sin servidor de previsualización ni navegador disponible en la sesión) — se documenta esto explícitamente en vez de reportar números fabricados, tal como exige el mandato §15/§33.

| Entidades | Render inicial | Interacción | Memoria | Actualización | Resultado |
|---|---|---|---|---|---|
| Cualquier volumen | No medido | No medido | No medido | **Verificado por inspección de código**: Orbit ya no reconstruye toda la escena cada 750ms; solo procesa entidades nuevas/eliminadas/con clave visual cambiada | Mejora arquitectónica confirmada por lectura de código y por las pruebas unitarias de `buildMarkers`/`applyMarkerUpdate`; sin evidencia cuantitativa de FPS/memoria |

**Método recomendado para una futura sesión con navegador**: generar un dataset sintético con las cantidades pedidas (100/500/1.000/5.000/10.000), medir con las DevTools Performance/Memory panels durante pan/zoom/actualización, y comparar antes/después del cambio de esta entrega usando el mismo hardware — el código ya deja la superficie (`buildMarkers`, `applyMarkerUpdate`) fácilmente instrumentable para eso.

---

## 19. Compatibilidad

- **APIs**: sin cambios — no se modificó ningún endpoint.
- **Mapa 2D**: sin cambios de contrato público de `OperationalMap.tsx` (misma interfaz de props).
- **Orbit**: mismo contrato de `Props` de `GlobeView.tsx`; internamente ahora exporta también `buildMarkers`/`GlobeMarker` (aditivo, no rompe nada).
- **AURA/FÉNIX**: `FenixPredictionFrameCard.tsx` solo cambió su color de severidad — su mapa Leaflet aislado y su lógica de simulación no se tocaron.
- **Notificaciones**: no se tocó `notificationVisuals.ts` ni `notificationCenterEngine.ts`.
- **Paneles**: `ArgusEventDetailPanel.tsx`/`EventDetailPanel.tsx`/`CriticalPoiInfoCard.tsx` no se modificaron.
- **Enlaces**: el único cambio de comportamiento visible para un usuario es que un enlace de fuente visual con URL insegura ahora se muestra como "Enlace no disponible" en vez de un enlace roto/peligroso — un endurecimiento, no una regresión funcional para URLs legítimas (http/https).

---

## 20. Riesgos residuales

- **P0**: ninguno detectado en el alcance de este prompt.
- **P1**: `src/app/app/page.tsx` sigue sin aplicar carga por viewport/bbox al llamar `/api/argus/events`, pese a que el endpoint ya lo soporta (§10, §21). En volúmenes altos esto sigue transfiriendo más datos de los necesarios al cliente.
- **P2**: `GlobeView` sigue sin distinguir demo de real a nivel de marcador construido (§14); el registro de capas sigue distribuido en 3 módulos en vez de uno solo por capa (§7); la reconstrucción de capas Leaflet en `OperationalMap.tsx` no se auditó a fondo por ausencia de evidencia de que sea un problema real.
- **P3**: no se pudo correr benchmark de rendimiento real (falta de entorno de navegador en esta sesión) — no es un riesgo de código, es una limitación de esta ejecución que una sesión futura con navegador puede cerrar.

---

## 21. Deuda técnica restante

| Deuda | Prioridad | Dependencia | Criterio de cierre |
|---|---|---|---|
| `page.tsx` no envía bbox/zoom a `/api/argus/events` | P1 | Ninguna técnica; sí de riesgo (página ya señalada como legada por Prompt 4) | Recalcular bbox en `moveend`/`zoomend` con debounce + `AbortController`, verificado por prueba de integración que confirme que un movimiento pequeño no dispara una nueva petición completa |
| `GlobeView` mezcla demo/real sin flag de procedencia en el marcador | P2 | Decisión de producto: ¿Orbit debe mostrar demo alguna vez? | Si sí: agregar `isDemo` a `GlobeMarker` y una señal visual distinta; si no: dejar de pasar `demoEvents` a `GlobeView` desde `page.tsx` |
| Registro de capas distribuido en 3 módulos en vez de un objeto único por capa (Fase E) | P2 | Migración de ~60 IDs de capa y sus consumidores | Solo si se detecta un caso concreto donde la fragmentación actual cause un bug — no se encontró ninguno en esta auditoría |
| Sin benchmark de rendimiento real (100-10.000 entidades) | P3 | Acceso a navegador/entorno de previsualización | Ejecutar el método descrito en §18 en una sesión con esas herramientas disponibles |
| Reconstrucción de capas Leaflet en cada cambio de props en `OperationalMap.tsx` (no incremental) | P3 | Evidencia de que sea un problema real primero | No tocar sin un caso concreto — Leaflet reutiliza DOM de forma distinta a Three.js y el mandato pide "actualización incremental cuando sea viable", no una reescritura especulativa |

---

## 22. Preparación para el próximo bloque

Para **Prompt 6 — Integración del análisis de impacto geoespacial**:
- La simbología ahora tiene una función de ranking de severidad exportada (`getArgusMarkerSeverityRank`) reutilizable si el motor de impacto necesita priorizar por severidad.
- El contrato de POI con zoom/prioridad (§12) ya está listo para ser consumido por un futuro cálculo de impacto — no se implementó ningún cálculo de impacto en esta entrega, solo se confirmó que la infraestructura de zoom/prioridad ya existente es la que ese motor debería consumir.
- La brecha de viewport/bbox en `page.tsx` (§21) es relevante para Prompt 6 si el análisis de impacto necesita datos acotados por área — vale la pena resolverla antes o junto con ese bloque.

No se implementó ningún motor de impacto, expediente territorial, ni grafo de crisis en esta entrega.

---

## 23. Estado Git

- **Rama**: `phase-3-ui-ux` (sin cambios de rama).
- **Cambios previos del usuario** (ya presentes al iniciar, no tocados): `docs/PUBLIC_CHANGELOG.md` y `src/data/publicChangelog.json` modificados y en el índice (staged); además, un conjunto grande de trabajo en curso del usuario relacionado con Prompt 3/4 (capa canónica de lectura, consolidación de fuentes) y con una función de conectividad de telecomunicaciones (`TelecomConnectivity*`), todo ya en el índice antes de esta sesión — **ninguno de esos archivos fue tocado**.
- **Cambios de esta tarea** (sin stagear, working tree):
  - Modificados: `src/lib/mapSymbols/argusMapSymbols.ts`, `src/components/map/OperationalMap.tsx`, `src/components/map/GlobeView.tsx`, `src/components/fenix/FenixPredictionFrameCard.tsx`, `src/components/map/VisualSourcePopup.tsx`, `src/lib/security/sanitizers.ts`.
  - Nuevos (sin seguimiento): `tests/map/argusMapSymbols.test.ts`, `tests/map/globeMarkerBuild.test.ts`, `tests/security/sanitizers.test.ts`.
- **Archivos eliminados**: ninguno.
- **Confirmación**: no se ejecutó `git reset`, `git checkout .`, `git restore .`, `git clean` ni `git stash` en ningún momento de esta sesión; no se revirtió ningún cambio previo del usuario.

---

## 24. Confirmación final

- No se realizó commit.
- No se realizó push.
- No se realizó deploy.
- No se modificaron secretos.
- No se ejecutaron migraciones destructivas (ni ninguna migración — `prisma/schema.prisma` no se tocó).
- No se actualizó el changelog público.
- No se cambió la versión pública de ARGUS.
- No se implementó IA generativa.
- No se construyó el motor completo de impacto geoespacial.
- No se creó ningún mapa, runtime, registro de capas, sistema de clustering ni sistema de selección nuevo — todos los cambios fueron quirúrgicos dentro de archivos existentes.
- No se incorporó `stealthFetch`.
- No se incorporaron cámaras ni escáneres de OSIRIS.
