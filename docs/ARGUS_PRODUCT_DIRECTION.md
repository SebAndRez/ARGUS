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

### Visual OSINT / Live Cameras

ARGUS incorpora una capa separada **Camaras en vivo** con fuentes publicas
versionadas como dataset estatico. Esta capa no reemplaza fuentes oficiales y
sirve como apoyo visual publico para contexto operacional.

Principios:

- capa apagada por defecto;
- YouTube embebido con `youtube-nocookie`, audio apagado y `playsinline`;
- EarthCam, SkylineWebcams u otros sitios se abren externamente si no entregan
  embed oficial claro;
- ubicacion y confianza se muestran explicitamente;
- no hay scraping, rehost, grabacion, reconocimiento facial ni seguimiento de
  personas;
- las camaras pueden pasar a una tabla `LiveCamera` futura con revision humana.

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

USGS Earthquake, GDACS, NOAA Tsunami y MET Norway son fuentes externas reales conectadas a ARGUS. NASA FIRMS queda activa cuando el operador configura una MAP_KEY.

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

NOAA Tsunami aporta los feeds Atom oficiales del National Tsunami Warning Center (NTWC) y Pacific Tsunami Warning Center (PTWC). ARGUS conserva el tipo de mensaje, región afectada, actualización, enlace oficial y coordenadas únicamente cuando el boletín las publica explícitamente.

MET Norway Locationforecast aporta pronóstico meteorológico por coordenada. ARGUS usa un User-Agent identificable, normaliza el primer punto horario utilizable y conserva temperatura, humedad, presión, viento, ráfaga, condición y hora de pronóstico cuando están disponibles.

NASA FIRMS aporta focos térmicos MODIS/VIIRS mediante su API Area CSV. La integración requiere una `NASA_FIRMS_MAP_KEY` gratuita y no intenta obtenerla automáticamente.

Todas las fuentes futuras deben pasar por el mismo principio:

```text
fuente externa
    → adaptador de acceso
    → validación de formato
    → normalizador ARGUS
    → evento con fuente, confianza, fecha, ubicación, severidad y acción
    → mapa y paneles
```

El registro maestro clasifica fuentes Tier 1, Tier 2 y Tier 3, incluyendo estado, prioridad, confiabilidad y modalidad de acceso. USGS, GDACS, NOAA Tsunami y MET Norway están activos; NASA FIRMS está activa si existe configuración.

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

La integración NOAA Tsunami incorpora:

- consulta concurrente de los feeds Atom NTWC y PTWC;
- normalización de Warning, Advisory, Watch, Threat e Information;
- caché server-side de 5 minutos;
- deduplicación por `sourceId + externalId`;
- capa opcional **NOAA Tsunami**, apagada por defecto;
- conteo separado de boletines totales y boletines con coordenadas renderizables;
- descarte exclusivo del marcador cuando el boletín no contiene un punto explícito, manteniendo el mensaje en el estado de fuente.

NOAA Tsunami no incorpora un modelo de propagación, tiempo de llegada, inundación costera ni predicción propia. ARGUS muestra el boletín institucional y remite a sus instrucciones oficiales.

La integración MET Norway incorpora:

- consulta de Locationforecast 2.0 Compact por latitud y longitud;
- User-Agent identificable conforme a los términos del servicio;
- redondeo de coordenadas a cuatro decimales;
- caché server-side de 10 minutos por coordenada;
- normalización de dirección y velocidad del viento, temperatura, humedad, presión, ráfaga y símbolo meteorológico;
- uso de ubicación GPS cuando está disponible y fallback Santiago cuando no;
- fallback visual a datos demo si MET Norway falla;
- estado de red/caché y reintento visible en `/app`.

MET Norway se usa como observación/pronóstico real de viento para la leyenda y apoyo a recomendaciones. Los polígonos actuales de clima/riesgo continúan siendo estimaciones demo y no constituyen un modelo científico de dispersión.

La base NASA FIRMS incorpora:

- variable `NASA_FIRMS_MAP_KEY` documentada en `.env.example`;
- estado `active_if_configured` y señal `configured` en `/api/ingest/status`;
- consulta Area CSV con bbox Chile por defecto, fuente `VIIRS_SNPP_NRT` y un día;
- parámetros opcionales `bbox`, `days` y `source` con validación conservadora;
- caché server-side de 15 minutos por fuente, bbox y rango temporal;
- parser CSV local sin dependencia adicional;
- normalización de coordenadas, fecha/hora, satélite, instrumento, confianza, FRP y brillo térmico;
- capa **NASA FIRMS** apagada por defecto y deshabilitada con mensaje `requiere MAP_KEY` cuando falta configuración;
- límite visual de 250 marcadores recientes para evitar saturar el mapa.

Un foco térmico no equivale necesariamente a un incendio confirmado. Puede representar actividad industrial, quema controlada, reflejos u otras anomalías. La interfaz mantiene esa distinción y no recalcula una pluma de humo real.

Evolución futura FIRMS:

- correlación FIRMS + MET Norway + reportes ciudadanos;
- contraste con viento, humedad y observaciones locales;
- persistencia y seguimiento de focos recurrentes;
- agrupación espacial y temporal validada;
- modelos de humo o propagación solo con metodología científica apropiada.

Evolución meteorológica futura:

- fuentes WMO y NOAA NWS según cobertura y términos;
- OpenAQ para calidad del aire;
- persistencia y series temporales;
- modelos de dispersión validados;
- comparación de pronóstico, observación y sensores locales.

El caché actual es local a cada instancia Node y se pierde al reiniciar o reemplazar el proceso. Es una protección de corto plazo, no una capa de persistencia ni una garantía compartida entre instancias.

La deduplicación actual opera dentro del lote normalizado de cada fuente. La deduplicación global y persistente entre proveedores sigue pendiente.

## Cross-source Correlation Foundation

ARGUS incorpora una base local y determinista de correlación entre eventos externos. Una correlación no representa certeza, fusión oficial de registros ni una conclusión de IA. Es una señal de apoyo para comparar fuentes.

Reglas iniciales:

- USGS + GDACS: posible mismo terremoto o confirmación cruzada cuando ambos eventos son sísmicos, ocurren dentro de 12 horas y están separados por un máximo de 300 km;
- USGS + NOAA: posible riesgo tsunami asociado cuando existe un terremoto USGS M6.5+ y un boletín NOAA dentro de 24 horas;
- GDACS + NOAA: posible riesgo costero relacionado cuando una alerta sísmica o tsunami de GDACS coincide temporalmente con un boletín NOAA;
- cuando NOAA no incluye coordenadas, la correlación se limita a tiempo y categoría, reduce su confianza y lo declara en la explicación.

La interfaz muestra las principales correlaciones, fuentes involucradas, confianza calculada, explicación y acción recomendada. Los textos usan expresiones como **posible relación**, **confirmación cruzada** y **riesgo asociado** para evitar prometer identidad o causalidad.

Evolución futura de correlación:

- persistencia y versionado de correlaciones;
- deduplicación global entre fuentes;
- auditoría de reglas, umbrales y decisiones;
- correlación con zonas costeras e infraestructura;
- síntesis asistida por IA con fuentes citadas y revisión humana;
- evaluación histórica de falsos positivos y falsos negativos.

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

## Predictive Risk And Knowledge Foundation

ARGUS incorpora una base v1 de prediccion situacional. No predice eventos
naturales con certeza; estima consecuencias probables con evidencia disponible.

Capacidades iniciales:

- assessments de tsunami, impacto sismico, humo/incendio e impacto humanitario;
- evidencia por fuente y confianza;
- persistencia de assessments y revisiones;
- contexto historico/doctrinal para Chile y doctrina general de desastres;
- APIs `/api/risk-assessments`, `/api/knowledge/facts` y
  `/api/knowledge/documents`;
- panel **Prediccion ARGUS** en `/app`;
- bloque **Analisis ARGUS** dentro del detalle de cada evento, reporte o fuente
  externa relevante.

La historia y doctrina elevan vigilancia, no confirman eventos actuales.

## Auth And Identity

ARGUS mantiene login local demo y agrega Google/Gmail como proveedor opcional de
identidad. Google se usa solo para autenticar `openid`, `email` y `profile`; no
lee correos ni solicita permisos de Gmail API.

La identidad civil sigue separada:

- `googleSub` identifica la cuenta Google;
- `governmentIdHash` identifica documento/RUT unico por persona;
- el documento/RUT debe almacenarse como hash o mecanismo seguro equivalente;
- Google no reemplaza la regla de una persona real = una cuenta validada.

La entrada desde el mapa debe ser limpia: un boton compacto **Login** abre
`/login`, donde el usuario puede iniciar sesion o crear cuenta. SOS mantiene
prioridad visual y operativa.

## Estado actual

La implementación actual incluye:

- mapa Leaflet táctico;
- HUD común civil/comando;
- selector de mapa sin API keys;
- eventos, SOS y reportes;
- detalle de evento y verificación local;
- Analisis ARGUS por evento con evidencia, confianza y accion recomendada;
- fuentes visuales demo;
- capa de camaras publicas en vivo con embed seguro y fallback externo;
- popup de fuentes;
- clima, viento y zona estimada de riesgo;
- rutas demo terrestres, aéreas y marítimas;
- registro maestro de fuentes externas;
- ingesta bajo demanda de sismos USGS M4.5+;
- ingesta bajo demanda de alertas globales GDACS;
- ingesta bajo demanda de boletines NOAA Tsunami NTWC/PTWC;
- ingesta de viento y clima MET Norway por coordenada;
- scaffold NASA FIRMS configurable para focos térmicos MODIS/VIIRS;
- dashboard operativo local;
- Prisma con Supabase PostgreSQL y autenticacion demo/Google opcional.
- Persistencia PostgreSQL de eventos externos, corridas de ingesta y base de
  correlaciones.
- UX móvil operacional con vistas de mapa limpio, paneles y capas.
- ReliefWeb como contexto humanitario Tier 1 condicionado a
  `RELIEFWEB_APP_NAME`.
- Capa defensiva de zonas de conflicto/crisis con GDELT como senal abierta,
  ReliefWeb como contexto humanitario, Liveuamap solo como referencia manual y
  ACLED deshabilitado hasta contar con API key/revision de terminos.

## ARGUS Orbit And Map Symbols

ARGUS Orbit is the global 3D view shown after the user zooms out beyond the
last useful 2D tactical map level. Orbit keeps the visual language dark,
operational and continuous with the 2D map. The user can return to 2D through
the exit control or by zooming in.

ARGUS Map Symbol System defines the map grammar:

- shape/icon = event type;
- color = severity or priority;
- border = confidence or source quality;
- pulse = active or recent event;
- size = operational importance;
- perimeter/area = estimated, confirmed or ARGUS hypothesis zone.

ReliefWeb remains in the codebase and endpoints, but is temporarily hidden from
the main UI until ingest reliability and contextual presentation are improved.

ReliefWeb aporta reportes de impacto y respuesta humanitaria. Sus documentos
no siempre incluyen coordenadas confiables, por lo que ARGUS los presenta en
un panel contextual y no inventa marcadores en el mapa.

Pendiente: automatización de ingestas, RLS, backups, HDX, GDELT y OpenAQ.

Las cámaras, clima, rutas, confianza y verificaciones de esta fase son fundaciones locales/demo. No existe todavía ingesta externa, persistencia completa, reputación real, clustering masivo ni notificaciones productivas.

## Mobile map-first rule

En movil, ARGUS usa una interfaz simplificada por panel activo unico. CAPAS,
CLIMA, RIESGO y CERCANOS no compiten entre si: abrir uno colapsa los otros.

El objetivo movil es mapa primero, accion rapida, HUD compacto, cero
superposicion y cero overflow horizontal.

Clima movil se muestra como pildora/tarjeta compacta para evitar que desaparezca
detras de otros paneles. `Vista mapa` limpia paneles secundarios y deja
controles esenciales, SOS y Reportar.

## QA final antes de produccion

Antes de deploy productivo, revisar Google login, RUT unico, prediccion por
evento/reporte, regla de 2+ confirmaciones, advertencia de estimacion/no exacto,
movil multi navegador, camaras, knowledge APIs, risk APIs, ausencia de secretos
y deploy por Vercel CLI.

## Missing persons reports

ARGUS soporta `missing_person` como categoria de reporte ciudadano sin exponer
datos sensibles innecesarios. La UI publica debe mostrar solo nombre/alias si
fue entregado, edad aproximada, ultima zona vista, hora aproximada y estado de
verificacion. No se muestran telefono, email ni contacto privado.

La capa `Desaparecidos` muestra marcadores discretos `MP` y sirve como indicador
operativo para busqueda/rescate. En fases posteriores puede separarse a una
tabla dedicada con flujo admin/analista, auditoria y contacto seguro.

## Orbit and 2D map

`Vista mapa` y `Salir de Orbit` deben volver siempre al mapa operacional 2D,
limpiar paneles secundarios en movil y preservar contexto de navegacion cuando
sea posible. Orbit es una vista global, no reemplaza el mapa tactico principal.

## Conflict zones and source reliability

La capa `Zonas de conflicto` es defensiva y de conciencia situacional. Debe
usar lenguaje neutral: zona de conflicto activo, zona disputada, zona bajo
control militar reportado, zona con ataques recientes, zona de riesgo elevado,
zona con catastrofe confirmada o zona con alerta humanitaria.

ARGUS no debe presentar control territorial, fronteras ni reportes de fuentes
abiertas como certeza. Liveuamap queda solo como referencia manual sin scraping.
ACLED queda deshabilitado hasta tener API key y revision de terminos. GDELT y
ReliefWeb se tratan como senales/contexto y no como instrucciones operativas.

## Modulos sobre ARGUS Core

ARGUS Core mantiene el mapa limpio: reportes, SOS, riesgo, comando y fuentes.
Fenix Twin y AURA Medic Mesh viven como modulos desplegables desde `Modulos`.

Fenix Twin tiene una vista publica simple y una capa institucional avanzada
para simulacion, rutas criticas, refugios y planes de accion.

AURA Medic Mesh tiene AURA Basic dentro de ARGUS libre: SOS medico, ficha
opcional, QR medico local y puntos medicos demo. AURA Pro queda como capa futura
institucional/profesional; no se implementa triage real ni datos clinicos reales
en esta fase.

## Crisis Command Center

ARGUS evoluciona hacia un Crisis Command Center. El publico ve instrucciones
simples; analistas y operadores ven evidencia, prioridad P0-P4, timeline,
limitaciones y acciones prudentes. ARGUS AI sigue siendo motor de reglas y
scoring sin tokens externos en esta fase.

## QuakeSense And Mobile Safety

ARGUS QuakeSense and Mobile Safety Agent add a citizen-safety layer on top of
the map-first product. They are not official seismic systems and must never be
presented as earthquake prediction.

Current scope:

- Web/PWA motion sensing demo for possible shaking.
- Runtime-only clustering of citizen signals.
- Preliminary map layer `Sacudida ciudadana`.
- Web/PWA demo safety check workflow.
- Map layer `Safety Checks`.

Future scope:

- Native Android/iOS agents.
- Offline safety response queue.
- Push/critical notification review.
- Correlation with CSN, SENAPRED, SHOA, USGS, GDACS and NOAA.
- Human-reviewed escalation and audit trails.

## Trust And Achievements

ARGUS can use cosmetic achievements to encourage useful participation, but
operational credibility remains evidence-based. Reportes validados pesan mas
que volumen. SOS, Missing Persons and personal emergencies are not gamified.

Credibilidad ARGUS can help review reports, but does not determine emergency
priority by itself and cannot replace official confirmation.

## Sensor Safety Suite

ARGUS Sensor Safety Suite prepares a future native mobile safety app. RoadSense,
FallSense, Route Guardian, Dead Man Switch and Black Box are demo/runtime in
web/PWA and must be labeled as experimental. Real background operation requires
Android/iOS native implementation, platform permissions and privacy review.

## Platform Lock And Access Layers

ARGUS now separates product surfaces into:

- ARGUS Core: citizen map, reports, SOS, alerts and guide.
- ARGUS Mobile: Safety Agent, QuakeSense, RoadSense, FallSense and check-ins.
- ARGUS Command: institutional dashboard, audit, Fenix, AURA Pro and advanced
  analysis.
- ARGUS API: closed partner/institutional API with keys, rate limits and audit.
- ARGUS Data License: no resale, no scraping, no mass extraction and no
  institutional or governmental reuse without formal permission.

Uso ciudadano remains possible through Core. Institutional, governmental,
commercial or automated use requires explicit authorization and contract. Demo,
runtime and experimental modules must stay labeled and must not be presented as
official authority.

## Security And Sensitive Data Direction

Sensitive data includes user identity, government ID hash, precise location,
reports, SOS, emergency contacts, optional medical data, Safety Check, missing
persons, sensor signals and Command Center context.

Current direction:

- Protect sensitive data through server API, RBAC and sanitizers.
- Do not persist medical/emergency profile data before RLS, audit and consent.
- Do not expose Supabase client access to sensitive tables.
- Plan RLS in staging before production.
- Keep SOS available even when account trust, profile completeness or
  verification are limited.

## Real Data Operations

ARGUS source operations now track real, configured, demo and review-required
sources. The product direction is:

- Use USGS, GDACS, NOAA, MET Norway, NASA FIRMS and ReliefWeb through legal,
  cached, rate-aware ingestion.
- Keep citizen reports, SOS, QuakeSense and Safety signals clearly labeled by
  confidence and source type.
- Maintain source health, stale warnings and key-required states.
- Treat GDELT, ACLED, Liveuamap, Reuters/Bloomberg and other curated/media
  sources as review-required until terms and contracts are clear.
- Build scheduler/backoff later; no infinite jobs in web runtime.
