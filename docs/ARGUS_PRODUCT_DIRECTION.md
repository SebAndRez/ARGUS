# ARGUS GRID - Product Direction

ARGUS GRID es una plataforma web/PWA de inteligencia operacional civil, crisis, seguridad ciudadana y coordinación geoespacial. El mapa es el producto principal.

ARGUS significa **Adaptive Response & Geospatial Unified System**.

El sistema apoya análisis, alertas, reportes, SOS y coordinación. No implementa targeting, armas, reconocimiento facial, seguimiento ofensivo ni sanciones automáticas.

## A. Civic Calm Interface

ARGUS debe ser simple para civiles y profundo para operadores.

Principios:

- lenguaje cotidiano y acciones claras;
- botones grandes y flujos previsibles;
- diseño "a prueba de abuelos", comprensible para personas con poca experiencia digital;
- mapa limpio, con capas activadas solo cuando aportan valor;
- color acompañado siempre por texto y contexto;
- información técnica disponible sin dominar la primera lectura;
- evitar alarmismo, certeza falsa y saturación visual.

Cada alerta importante debe responder:

1. Qué está pasando.
2. Qué tan confiable es.
3. De dónde viene.
4. Cuándo se actualizó.
5. Por qué importa.
6. Qué hacer ahora.

## B. Modo civil y modo operador

### Civil

- qué ocurre cerca;
- qué debe hacer ahora;
- SOS siempre accesible;
- creación de reportes según estado de cuenta;
- verificación ciudadana segura;
- confianza, fuente y actualización en lenguaje simple;
- cámaras, clima y rutas sin sobrecarga técnica.

### Operador

- prioridad y severidad;
- ciclo de vida y señales de verificación;
- fuentes y confianza;
- cámaras y OSINT;
- rutas terrestres, aéreas y marítimas;
- clima, viento y zonas estimadas de riesgo;
- timeline, auditoría y coordinación de respuesta;
- acciones administrativas separadas del modo civil.

`/app` prioriza la experiencia civil. `/dashboard` prioriza comando y operación. Ambos comparten HUD, mapa, taxonomía visual y componentes fundamentales.

## C. Roles institucionales futuros

Roles previstos:

- civil;
- policía;
- bomberos;
- EMS / salud;
- municipalidad;
- policía marítima;
- operador;
- analista;
- admin.

La validación institucional futura puede considerar placa o código, correo institucional, unidad, región, documento y aprobación administrativa. Ningún rol sensible debe habilitarse solo por declaración del usuario.

## D. Motor de confianza

ARGUS cruza señales y expresa confianza; no promete certeza del 100%.

Cada dato debe comunicar:

- nivel de confianza;
- fuente;
- última actualización;
- relevancia operacional;
- contradicciones o límites conocidos.

Modelo orientativo futuro:

| Puntaje | Referencia |
| --- | --- |
| 100 | Fuente oficial primaria más confirmación cruzada |
| 80 | Fuente oficial o agregador altamente confiable |
| 60 | Medio confiable u OSINT validado |
| 40 | Reporte ciudadano o señal de red social |
| 20 | Reporte aislado sin contraste |

La confianza futura debe considerar reputación de fuente, coincidencia entre señales, proximidad temporal/geográfica, validación institucional y calidad de ubicación. La IA puede sugerir; no sanciona ni decide automáticamente.

## E. Acción recomendada

Cada alerta relevante debe responder **¿Qué hago ahora?**

Ejemplo ante incendio o humo:

- cierre ventanas si está cerca;
- evite el humo y no se acerque;
- mantenga ubicación activa si necesita asistencia;
- siga instrucciones oficiales;
- use SOS ante peligro inmediato.

Modo operador:

- validar con otra fuente;
- revisar prioridad y ubicación;
- coordinar respuesta;
- actualizar estado;
- registrar evidencia y cierre.

## F. Ciclo operativo de alerta

Ciclo principal:

`nueva → en verificación → confirmada → en respuesta → resuelta → archivada`

Ciclo alternativo:

`nueva → sospechosa → descartada / falsa`

Base MVP actual:

- `new`;
- `verifying`;
- `confirmed`;
- `responding`;
- `resolved`;
- `expired`;
- `dismissed`.

Verificación ciudadana:

- **Sigo viendo esto**;
- **Ya no ocurre**;
- **No puedo verificar**;
- **Reactivar alerta** cuando una alerta expiró.

Una señal ciudadana no confirma, descarta, resuelve ni sanciona por sí sola. La base actual es local/demo y todavía no persiste verificaciones, reputación ni auditoría.

## G. Fuentes visuales y cámaras

Taxonomía:

- morado: cámara pública, open source o comercial tipo EarthCam;
- rojo institucional: fuente gubernamental u OSINT oficial;
- cian: sensor ARGUS o fuente verificada;
- ámbar: pendiente o no confirmada;
- gris: offline o histórica.

Experiencia:

- marcador circular con etiqueta corta;
- video embebido solo si está permitido;
- reproducción silenciada por defecto;
- audio y experiencia completa en la fuente externa;
- fallback **STREAM RESTRINGIDO** cuando no existe permiso de embed;
- metadata interna compacta y UI civil simple.

No se realiza scraping, reconocimiento facial, tracking de personas ni descarga automática de logos.

## H. Geolocalización de streams

Una fuente puede ubicarse por evento, recinto, ciudad o país.

`locationPrecision`:

- `exact`;
- `venue`;
- `city`;
- `country`;
- `unknown`.

Es preferible una aproximación segura a una exactitud falsa o riesgosa. Ejemplos:

- White House: etiqueta `WH` o `GOV`, ubicación aproximada a recinto/ciudad;
- G7 o evento en Versalles: recinto/ciudad cuando no exista una coordenada pública exacta.

La UI debe mostrar precisión y confianza de ubicación.

## I. Clima, viento y riesgo

Convención:

- `windFromDeg`: desde dónde viene el viento;
- `windToDeg`: hacia dónde podría moverse humo, gas o contaminantes;
- `windToDeg = (windFromDeg + 180) % 360`.

La capa actual genera una **Zona estimada de riesgo** de baja opacidad. Es una aproximación visual demo, no una predicción científica ni una nube exacta.

Evolución futura:

- observaciones meteorológicas oficiales;
- sensores y cámaras geolocalizadas;
- humo, incendios y posible dispersión química;
- modelos serios de dispersión atmosférica;
- revisión humana y comunicación de incertidumbre.

Nunca reemplaza instrucciones oficiales ni evaluación en terreno.

## J. Capas, mapas y rutas

Tipos de mapa:

- táctico: OpenStreetMap con tratamiento visual oscuro;
- calles: OpenStreetMap con lectura convencional;
- claro: OpenStreetMap con tratamiento visual de alto contraste;
- satélite: reservado hasta disponer de proveedor autorizado.

Capas actuales/demo:

- reportes, SOS, alertas, críticos y resueltos;
- mi ubicación;
- fuentes visuales;
- fuentes oficiales;
- cámaras públicas;
- clima y riesgo;
- rutas terrestres;
- rutas aéreas;
- rutas marítimas.

Las rutas son ilustrativas, de baja opacidad y no representan tráfico, corredores autorizados ni navegación real. El roadmap contempla logística e infraestructura crítica.

## K. Fuentes futuras de datos

No implementar integraciones hasta crear el módulo de ingesta y revisar términos, límites y licencias.

### Tier 1 - MVP

- USGS Earthquake GeoJSON / FDSN: terremotos;
- GDACS: alertas globales de desastre;
- NASA FIRMS: incendios y focos térmicos;
- MET Norway API: clima por coordenada;
- NOAA Tsunami feeds: tsunamis;
- ReliefWeb API: crisis humanitaria;
- GDELT: señales geopolíticas y noticias;
- OpenStreetMap data: base geográfica.

### Tier 2

- Copernicus GloFAS / GFM: inundaciones;
- HDX HAPI: datasets humanitarios;
- OpenAQ: calidad del aire;
- NASA EONET: eventos naturales;
- ACLED: conflicto y protestas bajo sus términos.

### Tier 3 - Referencia o pago

- Liveuamap: referencia visual futura para conflicto/guerra; integración pagada;
- AccuWeather: servicio comercial, no base open/free ideal;
- AP, Reuters y Bloomberg: fuentes confiables, no destinadas a scraping o uso intensivo gratuito.

Para terremotos, USGS es la fuente base prevista. Para conflicto, Liveuamap puede servir como referencia visual futura, no como integración inmediata.

## Demo Reports, Filtering and Scalability

ARGUS incluye una capa local de **420 reportes ciudadanos demo** para probar densidad visual sin contaminar los datos reales.

Características:

- generación determinística mediante seed fija;
- distribución aproximada en 15 comunas de Santiago;
- categorías civiles, alertas y SOS sintéticos;
- severidad, prioridad, confianza y ciclo de vida compatibles con `CrisisEvent`;
- filtros por severidad, tipo y estado de ciclo;
- agrupación geoespacial simple por grilla latitud/longitud;
- clusters circulares con cantidad y severidad máxima;
- selección del evento de mayor prioridad dentro del cluster;
- bandeja cercana limitada a 20 resultados;
- orden por criticidad, prioridad, distancia, recencia y confianza;
- capa desactivada por defecto y separada de reportes reales.

Esta base sirve para evaluar legibilidad y comportamiento del frontend. No representa actividad real ni ejecuta persistencia, auditoría o reputación.

Evolución necesaria para volumen productivo:

- clustering dinámico según zoom;
- heatmap especializado;
- virtualización de listas;
- paginación y consultas espaciales en backend;
- almacenamiento geoespacial;
- deduplicación y agrupación semántica;
- pruebas de rendimiento con ingesta real.

## L. Arquitectura futura de ingesta

```text
[USGS / GDACS / NASA FIRMS / NOAA / MET Norway / ReliefWeb / HDX / GDELT / OpenAQ]
    → adaptadores por fuente
    → normalizador ARGUS
    → event_type
    → severity
    → source_confidence
    → location / radius
    → affected_population
    → timestamp
    → verification_status
    → recommended_action
    → mapa / alertas / dashboard / IA / timeline
```

La normalización debe conservar atribución, timestamp original, licencia, precisión geográfica y nivel de confianza.

## Data Ingestion Foundation

USGS Earthquake y GDACS son las primeras fuentes externas reales conectadas a ARGUS.

La integración inicial:

- consulta el feed oficial USGS M4.5+ del último día mediante una API interna;
- no requiere API key;
- aplica timeout y manejo explícito de errores;
- normaliza GeoJSON a `ArgusNormalizedEvent`;
- conserva identificador externo, fuente, magnitud, profundidad, ubicación, fecha y URL oficial;
- asigna severidad y confianza con reglas transparentes;
- agrega explicación y acción recomendada;
- se activa bajo demanda desde la capa **Sismos USGS**;
- permanece separada de reportes ciudadanos y reportes demo.

USGS se considera fuente oficial primaria para terremotos. Su alta confianza no elimina la necesidad de comunicar fecha, ubicación, magnitud, profundidad y límites de interpretación.

GDACS funciona como semáforo global institucional de desastres. ARGUS consume su RSS público, conserva el nivel Green, Orange o Red y normaliza alertas georreferenciadas de terremotos, inundaciones, ciclones, volcanes, sequías e incendios forestales.

Todas las fuentes futuras deben pasar por el mismo principio:

```text
fuente externa
    → adaptador de acceso
    → validación de formato
    → normalizador ARGUS
    → evento con fuente, confianza, fecha, ubicación, severidad y acción
    → mapa y paneles
```

El registro maestro clasifica fuentes Tier 1, Tier 2 y Tier 3, incluyendo estado, prioridad, confiabilidad y modalidad de acceso. USGS y GDACS están activos en esta fase.

Liveuamap queda como referencia visual y posible integración pagada futura, no como API gratuita principal. AP, Reuters, Bloomberg, AccuWeather y cualquier servicio comercial requieren acuerdos y licencias apropiadas.

ARGUS no realiza scraping. Las integraciones deben respetar términos, atribución, límites de uso y licencias de cada proveedor. Todavía no existen base de datos de ingesta, jobs automáticos, reintentos programados, deduplicación entre fuentes ni monitoreo productivo.

## Source Reliability, Cache and Health

La ingesta externa debe exponer no solo eventos, sino también el estado operativo de cada fuente.

La integración USGS actual incorpora:

- caché temporal server-side en memoria del runtime;
- TTL de 60 segundos para evitar consultas repetidas innecesarias;
- metadata `cached`, `fetchedAt` y `expiresAt` en cada respuesta;
- deduplicación por `sourceId + externalId`, conservando la versión más reciente;
- endpoint `/api/ingest/status` para consultar registro, estado, confiabilidad, modalidad de acceso y metadata de caché sin llamar servicios externos;
- estado visible en `/app`, incluyendo origen red/caché, última actualización y reintento manual ante error.

La integración GDACS incorpora:

- lectura del RSS público de 24 horas, con fallback al RSS de 7 días;
- normalización de tipo de desastre, semáforo, ubicación, fecha y enlace oficial;
- descarte de items sin coordenadas válidas para evitar representación geográfica ambigua;
- caché server-side de 5 minutos;
- deduplicación por `sourceId + externalId`;
- capa opcional **GDACS Desastres**, apagada por defecto;
- estado de red/caché, cantidad y reintento visible en `/app`.

El RSS puede contener eventos actualizados fuera de la ventana nominal, texto variable, codificación heredada o items sin coordenadas. La normalización es conservadora y no reemplaza el reporte oficial enlazado.

El caché actual es local a cada instancia Node y se pierde al reiniciar o reemplazar el proceso. Es una protección de corto plazo, no una capa de persistencia ni una garantía compartida entre instancias.

La deduplicación actual opera dentro del lote normalizado de cada fuente. La correlación de un mismo incidente entre proveedores diferentes sigue pendiente.

La correlación futura deberá identificar, por ejemplo, cuándo un terremoto USGS y una alerta GDACS representan el mismo incidente sin perder atribución, timestamps ni diferencias de severidad.

Evolución futura:

- persistencia de eventos y metadata de fuente en base de datos;
- jobs programados con límites y ventanas por proveedor;
- monitoreo de latencia, disponibilidad y errores;
- políticas de reintento con backoff;
- auditoría de consultas, cambios y deduplicación;
- salud agregada por fuente e instancia.

## M. Roadmap

- paneles colapsables;
- control mejorado de mi ubicación;
- salto a capitales y ciudades;
- tablero compartido;
- anotaciones manuales;
- modo crisis;
- alertas predictivas con incertidumbre;
- clustering y stress tests;
- persistencia de verificaciones;
- reputación;
- auditoría;
- notificaciones reales;
- ingesta real de fuentes;
- timeline operacional;
- logística e infraestructura crítica.

## Estado actual

La implementación actual incluye:

- mapa Leaflet táctico;
- HUD común civil/comando;
- selector de mapa sin API keys;
- eventos, SOS y reportes;
- detalle de evento y verificación local;
- fuentes visuales demo;
- popup de fuentes;
- clima, viento y zona estimada de riesgo;
- rutas demo terrestres, aéreas y marítimas;
- registro maestro de fuentes externas;
- ingesta bajo demanda de sismos USGS M4.5+;
- ingesta bajo demanda de alertas globales GDACS;
- dashboard operativo local;
- Prisma/SQLite y autenticación demo existentes.

Las cámaras, clima, rutas, confianza y verificaciones de esta fase son fundaciones locales/demo. No existe todavía ingesta externa, persistencia completa, reputación real, clustering masivo ni notificaciones productivas.
