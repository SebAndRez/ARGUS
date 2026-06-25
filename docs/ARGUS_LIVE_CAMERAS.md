# ARGUS GRID - Live Cameras

ARGUS incluye una capa opcional de camaras publicas en vivo para conciencia
situacional visual. La capa esta apagada por defecto y se activa manualmente en
`/app` desde el panel de capas.

## Alcance

- Dataset estatico versionado en `src/data/liveCameras.ts`.
- Marcadores publicos georreferenciados con ubicacion aproximada cuando no hay
  precision confirmada.
- Panel interno con stream embebido solo cuando el proveedor lo permite.
- Fallback claro de **Embed restringido** con boton para abrir la fuente
  original.
- Audio apagado por defecto.

## Fuentes iniciales

La semilla incluye 29 fuentes:

- 25 camaras base del prompt, principalmente YouTube;
- 4 fuentes web adicionales de EarthCam/SkylineWebcams como apertura externa.

YouTube se embebe con `youtube-nocookie.com`, `mute=1` y `playsinline=1`.
EarthCam, SkylineWebcams u otras paginas web quedan como `embedAllowed=false`
salvo que exista un embed oficial claro.

## Reglas de seguridad

ARGUS no realiza:

- scraping;
- descarga, rehost o grabacion de video;
- reconocimiento facial;
- seguimiento de personas;
- analisis IA de video;
- reproduccion automatica con audio;
- uso de fuentes pagadas o privadas.

La capa no reemplaza fuentes oficiales ni constituye vigilancia individual. Su
uso es apoyo visual publico para operadores y civiles.

## Datos de ubicacion

Cada camara declara:

- proveedor;
- pais, ciudad o region cuando corresponde;
- latitud y longitud;
- precision de ubicacion;
- confianza de ubicacion;
- URL original;
- si permite embed o requiere apertura externa.

Cuando la ubicacion exacta no es publica o no esta confirmada, ARGUS usa
`locationPrecision: "approximate"` o `city` y lo comunica en el panel.

## Evolucion futura

- Tabla `LiveCamera` en base de datos cuando haya flujo editorial.
- Auditoria de altas, bajas y cambios de fuentes.
- Validacion periodica de embed y estado.
- Agrupacion por pais, riesgo, proveedor y relevancia operacional.
- Relacion con clima, reportes ciudadanos e incidentes cercanos sin inferir
  vigilancia individual.
