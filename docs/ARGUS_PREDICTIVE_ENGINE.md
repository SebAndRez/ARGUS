# ARGUS Predictive Engine

ARGUS Predictive Engine v1 no predice eventos naturales con certeza. Analiza
consecuencias probables a partir de fuentes externas, correlaciones y contexto
historico/doctrinal.

## Principios

- Habla en hipotesis: watch, posible, probable, reducido o confirmado por
  fuente oficial.
- No usa LLM externo ni OpenAI API en esta version.
- No reemplaza alertas oficiales.
- Cada assessment incluye probabilidad, confianza, evidencia y accion
  recomendada.
- La historia se usa como contexto secundario, no como confirmacion actual.

## Reglas v1

- Terremoto costero M6.5+ -> vigilancia tsunami hasta confirmacion NOAA/SHOA.
- NOAA warning/advisory/watch eleva la hipotesis; no threat/information la
  reduce.
- Terremoto M6+ superficial -> revision de impacto e infraestructura.
- NASA FIRMS + FRP/confianza alta -> posible humo o incendio, aclarando que un
  foco termico no confirma incendio.
- GDACS severo + ReliefWeb -> posible impacto humanitario.
- La doctrina general ayuda a pensar cadenas de eventos: terremoto + tsunami,
  incendio + viento + humo, volcan + lluvia + lahar, accidente industrial +
  viento + poblacion expuesta.

## Ejemplos

- Terremoto M7.1 superficial + NOAA sin warning: posible riesgo de tsunami
  pendiente de confirmacion oficial.
- Foco termico FIRMS con FRP alto: posible humo/incendio, revisar viento y
  reportes oficiales.
- GDACS orange/red + contexto ReliefWeb: posible impacto humanitario.

## Limitaciones

- No hay modelo real de tsunami.
- No hay modelo cientifico de dispersion de humo.
- No hay RAG ni embeddings.
- No hay notificaciones push.
- La doctrina no eleva un assessment a `confirmed`; solo aporta contexto y
  preguntas operativas.

## Futuro

- RAG con documentos curados.
- Auditoria detallada de reglas y umbrales.
- Comparacion historica de falsos positivos/falsos negativos.
- Sintesis con IA citando fuentes y con revision humana.

## Analisis Por Evento

El detalle de cada reporte ciudadano, SOS, alerta interna o evento externo puede
mostrar un bloque **Analisis ARGUS** bajo demanda. El bloque consulta
`/api/risk-assessments` solo cuando el usuario abre el detalle, para no cargar
analisis de todos los marcadores al iniciar el mapa.

El bloque muestra hipotesis, estado, probabilidad, confianza, evidencia, accion
recomendada y contexto historico/doctrinal cuando existe. En reportes ciudadanos
sin assessment, ARGUS muestra una verificacion prudente: el reporte requiere
contraste con fuentes oficiales, camaras o reportes cercanos.

El contexto historico no confirma eventos actuales. Las fuentes oficiales tienen
prioridad sobre doctrina o antecedentes.

## Confirmaciones y confianza

ARGUS calcula confirmaciones independientes en runtime. No agrega campos nuevos
al schema para esta fase.

Reglas actuales:

- Reporte ciudadano unico: hipotesis baja/media, pendiente de confirmacion.
- Multiples reportes ciudadanos independientes: suben a hipotesis posible, no
  confirmada.
- Reporte ciudadano + fuente tecnica/oficial: sube confianza si la evidencia
  coincide.
- Una fuente oficial/veraz como USGS, NOAA, GDACS, NASA FIRMS, MET Norway o
  ReliefWeb puede generar hipotesis de confianza media/alta.
- Dos o mas fuentes independientes muestran badge `2+ confirmaciones`.
- Contexto historico aporta apoyo, pero nunca confirma por si solo.
- Camara disponible es fuente visual auxiliar; ARGUS no analiza video
  automaticamente.

Toda salida visible debe incluir:

```text
Estimacion ARGUS: no es una prediccion exacta ni reemplaza informacion oficial.
```

La palabra `confirmado` se reserva para casos con fuente oficial explicita o
confirmacion cruzada suficiente y aun asi debe mantener el contexto de
estimacion operacional.
