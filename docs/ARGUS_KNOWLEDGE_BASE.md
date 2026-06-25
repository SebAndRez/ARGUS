# ARGUS Hazard Knowledge Base

La base de conocimiento ARGUS almacena hechos historicos, doctrina, umbrales y
fuentes documentales para apoyar el analisis predictivo. No funciona como alerta
en vivo.

## Diferencia con fuentes en vivo

- Fuente en vivo: USGS, NOAA, GDACS, NASA FIRMS, MET Norway, ReliefWeb.
- Conocimiento historico: documentos, casos, patrones y doctrina.

El conocimiento historico puede explicar por que una hipotesis merece vigilancia,
pero nunca confirma un evento actual por si solo.

## Documento inicial

El primer documento extraido manualmente es:

- `Tsunamis registrados en la costa de Chile`
- Fuente: Proteccion Civil Espana
- URL: https://www.proteccioncivil.es/catalogo/naturales/jornada-maremotos/documentacion/docu2.pdf

Incluye hechos historicos sobre tsunamis de Chile entre 1562 y 1835.

## Corpus chileno

ARGUS registra documentos curados sobre terremotos, tsunamis, amenaza sismica,
evacuacion, salud publica y gestion de emergencias. Muchos quedan en estado
`queued` hasta extraccion manual.

## Doctrina general de desastre

ARGUS incluye una base doctrinal inicial en
`src/data/knowledge/disasterKnowledgeBase.ts` para cubrir amenazas naturales,
tecnologicas y sanitarias. Cada ficha mantiene:

- descripcion basica;
- senales criticas;
- eventos secundarios probables;
- umbrales operativos;
- acciones civiles recomendadas;
- acciones para analista;
- infraestructura critica;
- ejemplos historicos;
- fuentes recomendadas;
- urgencia, confianza y mensaje publico sugerido.

Esta doctrina cubre terremotos, tsunami, replicas, licuefaccion, incendios,
calor, inundaciones, crecidas, ciclones, marejadas, tornados, tormentas,
granizo, volcanes, ceniza, lahares, deslizamientos, avalanchas, frio extremo,
sequia, polvo, meteoritos, brotes biologicos, accidentes quimicos, nucleares,
radiologicos y explosiones industriales. Sigue siendo contexto operativo; no es
una alerta oficial ni una prediccion absoluta.

## Como agregar fuentes

1. Registrar documento en `src/data/knowledge/chileHazardSourceRegistry.ts`.
2. Agregar facts manuales en el mismo archivo o un archivo dedicado.
3. Ejecutar la API de knowledge o seed idempotente.
4. Mantener sourceUrl, categoria, prioridad, estado de extraccion y limitaciones.

## Limitaciones

- No hay OCR automatico.
- No hay scraping.
- No hay descarga de PDFs en runtime.
- Los documentos queued no deben usarse como evidencia fuerte.
- Las inferencias deben indicar incertidumbre.

## Deuda operativa

Las APIs de knowledge pueden ejecutar seed idempotente para asegurar datos base
en entornos nuevos. El runtime revisa registros centinela antes de resembrar
para evitar upserts masivos en cada GET. Esto no descarga documentos ni debe
duplicar filas, pero sigue siendo deuda tecnica: mover el seed a un script o
endpoint administrativo en una fase posterior.
