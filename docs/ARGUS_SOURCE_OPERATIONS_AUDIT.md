# ARGUS Source Operations Audit

Fecha: 2026-07-01.
Sprint: Real Data Operations / Ingest Pipeline / Source Monitoring.

## Resumen

ARGUS ya integra o prepara fuentes reales, demo y runtime. El objetivo de esta
fase es hacer visible la confiabilidad operativa: fuente, estado, refresh,
cache, deduplicacion, legalidad, key requerida y limitaciones.

## Fuentes Auditadas

| Fuente | Tipo | Endpoint | Key | Frecuencia | Estado | Confiabilidad | UI | Command |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| USGS Earthquake | Terremotos | `/api/ingest/usgs-earthquakes` | No | 1 min | Real | Oficial/tecnica alta | Mapa | Si |
| GDACS | Desastres globales | `/api/ingest/gdacs-alerts` | No | 5 min | Real | Institucional alta | Mapa | Si |
| NOAA Tsunami | Tsunami | `/api/ingest/noaa-tsunami` | No | 5 min | Real | Oficial alta | Mapa | Si |
| MET Norway | Clima/viento | `/api/ingest/met-weather` | No, requiere User-Agent | 10 min | Real por coordenada | Tecnica alta | Clima/riesgo | Si |
| NASA FIRMS | Focos termicos | `/api/ingest/nasa-firms` | Si | 15 min | Activa si configurada | Oficial/tecnica alta | Mapa | Si |
| ReliefWeb | Contexto humanitario | `/api/ingest/reliefweb-reports` | App name | 30 min | Activa si configurada | Humanitaria alta | Contexto | Si |
| GDELT | Noticias/geopolitica | Pendiente | No | 15 min | Placeholder | Media, requiere contraste | No | No |
| ACLED | Conflicto | Pendiente | Terminos/licencia | 60 min | Planned | Curada | No | No |
| Liveuamap | Conflicto visual | No usar scraping | Pago/licencia | Manual | Reference | Curada/media | No | No |
| Reportes ciudadanos | Ciudadano | `/api/reports`, `/api/help-requests` | No | Tiempo real | Real interno | Preliminar | Mapa | Si |
| QuakeSense | Sensor | `/api/quakesense/*` | No | Runtime | Demo/experimental | Sensor preliminar | Mapa | Si |
| Sensor Safety | Sensor | `/api/sensor-safety/*` | No | Runtime | Demo/experimental | Sensor preliminar | Mapa | Si |
| Camaras/fuentes visuales | Visual | Datos curados/demo | No | Manual | Demo/curado | Apoyo visual | Mapa | Parcial |
| Rutas/NAV | Routing | `/api/routing-intelligence/routes` | No | Demo | Demo | Ilustrativa | Mapa | Parcial |
| Medical points | Medico | `/api/medical-points` | No | Demo | Demo | No oficial | AURA | Parcial |

## Terminos Y Riesgos

- No hacer scraping agresivo.
- No usar Liveuamap, ACLED, Reuters, Bloomberg u otras fuentes pagadas sin
  licencia.
- NASA FIRMS requiere MAP_KEY; no imprimir ni exponer key.
- ReliefWeb requiere App Name y respeto de terminos.
- MET Norway requiere User-Agent identificable.
- Reportes ciudadanos son preliminares.
- QuakeSense/Safety no son fuentes oficiales y no deben sancionar
  automaticamente.

## Integracion Implementada

- Registro operacional: `src/lib/sources/sourceRegistry.ts`.
- Health engine: `src/lib/sources/sourceHealthEngine.ts`.
- API: `/api/sources/status`.
- `/api/ingest/status` incluye `sourceHealth`.
- Command Center muestra Source Operations.
- Jobs declarativos: `src/lib/ingest/ingestJobRegistry.ts`.
- Retry/backoff: `src/lib/ingest/retryPolicy.ts`.
- Dedup fase 1: `src/lib/ingest/deduplicationEngine.ts`.
- Normalizador generico: `src/lib/ingest/eventNormalizer.ts`.

## Pendiente Para Produccion

- Scheduler real controlado.
- Persistir health y errores por fuente.
- Backoff operativo conectado a jobs.
- Alertas por fuente stale/degraded.
- Contratos/API keys por partner.
- Pruebas de carga y rate limits.
- Revision legal de cada fuente pagada/curada.
