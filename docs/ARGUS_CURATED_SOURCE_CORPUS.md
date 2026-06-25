# ARGUS Curated Source Corpus

ARGUS mantiene un corpus documental curado para contexto historico y doctrinal.
Estas fuentes no son alertas en vivo y no reemplazan boletines oficiales.

## Criterios

- Prioridad 1: fuentes institucionales, cientificas o planes operativos clave.
- Prioridad 2: fuentes tecnicas o historicas utiles.
- Prioridad 3: articulos o referencias secundarias.
- `queued`: documento registrado, pendiente de extraccion.
- `partially_extracted`: tiene facts manuales iniciales.
- `seeded`: doctrina o facts internos curados.

## Documentos iniciales

El registro vive en `src/data/knowledge/chileHazardSourceRegistry.ts` e incluye
27 documentos iniciales sobre Chile, tsunami, terremoto, salud publica,
evacuacion, geologia, infraestructura y resiliencia.

## Reglas

- No usar documentos como confirmacion de eventos actuales.
- No generar alertas oficiales falsas.
- No descargar ni procesar PDFs automaticamente en runtime.
- Mostrar fuentes doctrinales relacionadas como contexto limitado.

## Evolucion

- Extraccion manual incremental.
- Auditoria de fuentes.
- Versionado de facts.
- Integracion futura con RAG/embeddings si se aprueba arquitectura y seguridad.
