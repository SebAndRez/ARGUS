/**
 * ARGUS Prompt 16 — registro canónico de fuentes y taxonomía de estado
 * operacional.
 *
 * Este archivo es la única fuente de verdad para responder "¿esta fuente
 * está realmente alimentando ARGUS hoy?" — separa deliberadamente
 * **capacidad** (lo que este archivo declara: existe un adaptador, requiere
 * tal credencial, está o no programado) de **funcionamiento real** (lo que
 * `deriveSourceOperationalStatus()` calcula a partir de ejecuciones
 * observadas en `KnowledgeIngestionRun`). El registro nunca contiene estado
 * dinámico como constante estática (Prompt 16 §6).
 *
 * No reemplaza ni fusiona los otros ~8 registros del repositorio que
 * resuelven problemas distintos (gobernanza de permisos, catálogo de citas
 * para ORÁCULO, curaduría de zonas de conflicto, paquete de fuentes
 * chilenas) — ver `docs/operations/ARGUS_SOURCE_OPERATIONS_BASELINE.md` §2
 * para el inventario completo y la justificación de por qué cada uno queda
 * fuera de esta consolidación. Este registro SÍ absorbe conceptualmente el
 * rol de `VIGIA_SOURCE_REGISTRY` (`src/lib/vigia/sourceRegistry.ts`, que se
 * mantiene sin cambios de forma para no romper a `globalWatchEngine.ts` ni a
 * los consumidores existentes de Source Health) — cada entrada programada
 * aquí tiene una entrada equivalente allá, y este archivo es ahora la vista
 * ampliada que además cubre las fuentes reales sin programar, los stubs y
 * las fuentes chilenas sin adaptador.
 */

// ---------------------------------------------------------------------------
// Taxonomías
// ---------------------------------------------------------------------------

/** Qué papel cumple la fuente en la cadena de un incidente (Prompt 16 §10). */
export type SourceRole =
  | "detection" // puede crear un candidato o incidente nuevo
  | "confirmation" // corrobora un incidente ya existente de otra fuente
  | "enrichment" // añade impacto, geometría, población expuesta, etc. a un incidente existente
  | "context" // aporta entorno (clima, infraestructura, calidad del aire) sin crear incidente
  | "historical"; // se usa para análisis/aprendizaje, no para detección en vivo

/** Capacidad de ejecución declarada — no implica que la ejecución esté sucediendo. */
export type SourceExecutionMode =
  | "scheduled" // tiene un scheduler real (Global Watch u otro job dedicado) que la invoca periódicamente
  | "manual" // solo se ejecuta vía endpoint/acción de operador
  | "context_only" // se invoca bajo demanda para enriquecer un incidente/coordenada puntual, nunca por cadencia propia
  | "disabled"; // desactivada intencionalmente (no debe ejecutarse aunque el código exista)

/** Estado real del código del adaptador — hecho técnico, no de configuración. */
export type SourceAdapterStatus =
  | "implemented" // hace una petición de red real, con timeout, y normaliza una respuesta tipada
  | "stub" // no ejecuta ninguna consulta real (p. ej. devuelve `plannedAdapterResult`, o no existe archivo de fetch)
  | "broken"; // código presente pero estructuralmente incapaz de completar una ejecución válida

/**
 * Estado operacional dinámico (Prompt 16 §5) — nunca se persiste como
 * constante; siempre se deriva en el momento de la consulta a partir de
 * `ArgusSourceDefinition` (capacidad) + `SourceHealthSignal` (señal de
 * ejecución real). Ninguna fuente puede declararse `operational` solo
 * porque su endpoint respondió 200 una vez (Prompt 16 §18).
 */
export type SourceOperationalStatus =
  | "operational"
  | "degraded"
  | "configured_not_scheduled"
  | "manual_only"
  | "missing_credentials"
  | "not_configured"
  | "stub"
  | "broken"
  | "disabled"
  | "retired";

/** Códigos de error normalizados (Prompt 16 §26) — nunca el mensaje crudo del proveedor como contrato público. */
export type SourceErrorCode =
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "NETWORK_ERROR"
  | "PARSING_ERROR"
  | "UPSTREAM_5XX"
  | "PERSISTENCE_ERROR"
  | "LOCKED"
  | "DISABLED";

export type ArgusSourceDefinition = {
  id: string;
  name: string;
  /** Dominio/tema libre (earthquake, wildfire, public_health, flood, ...) — no es la taxonomía de amenaza de ArgusEvent, es agrupación descriptiva para el inventario. */
  category: string;
  coverage: "global" | "regional" | "national";
  coverageDetail?: string;
  role: SourceRole;
  executionMode: SourceExecutionMode;
  adapterStatus: SourceAdapterStatus;
  isOfficial: boolean;
  /** 0-100, mismo vocabulario que `VigiaSourceDefinition.reliabilityScore`. */
  reliabilityScore: number;
  /** Variables de entorno requeridas para ejecutar (vacío = no requiere credenciales). */
  requiredEnv: string[];
  endpoint: string;
  /** Guarda externa de tiempo (Prompt 16 §16) — siempre ≥ el timeout interno conocido del adaptador, nunca lo sustituye. */
  timeoutMs: number;
  /** Presente únicamente cuando `executionMode === "scheduled"`. */
  scheduler?: { intervalMinutes: number; owner: string };
  /** Dónde termina el dato: KnowledgeIncident/evidencia/contexto/ninguno. Prompt 16 §24. */
  consumer: string;
  /** Job programado responsable cuando la fuente no se auto-consulta (p. ej. SENAPRED vía chile-alerts). */
  managedByJob?: string;
  notes: string;
};

// ---------------------------------------------------------------------------
// Registro canónico
// ---------------------------------------------------------------------------

/**
 * Grupo A — ya maduras y en producción vía Global Watch. Metadata replicada
 * (no reinventada) desde `VIGIA_SOURCE_REGISTRY`; ver justificación de
 * mantener ambos archivos en el docstring de arriba.
 */
const SCHEDULED_SOURCES: ArgusSourceDefinition[] = [
  {
    id: "usgs_earthquake",
    name: "USGS Earthquake Hazards",
    category: "earthquake",
    coverage: "global",
    role: "detection",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 94,
    requiredEnv: [],
    endpoint: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
    timeoutMs: 20_000,
    scheduler: { intervalMinutes: 5, owner: "globalWatchEngine" },
    consumer: "KnowledgeIncident + evidencia (mapa, notificaciones)",
    notes: "Grupo A. Fuente líder de sismos, sin credenciales.",
  },
  {
    id: "gdacs",
    name: "GDACS (UN/EC Global Disaster Alert)",
    category: "multi_hazard",
    coverage: "global",
    role: "detection",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 92,
    requiredEnv: [],
    endpoint: "https://www.gdacs.org/xml/rss.xml",
    timeoutMs: 20_000,
    scheduler: { intervalMinutes: 15, owner: "globalWatchEngine" },
    consumer: "KnowledgeIncident + evidencia (mapa, notificaciones)",
    notes: "Grupo A. Multi-amenaza oficial ONU/CE.",
  },
  {
    id: "nasa-eonet",
    name: "NASA EONET Natural Events",
    category: "multi_hazard",
    coverage: "global",
    role: "detection",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 88,
    requiredEnv: [],
    endpoint: "https://eonet.gsfc.nasa.gov/api/v3/events/geojson",
    timeoutMs: 20_000,
    scheduler: { intervalMinutes: 30, owner: "globalWatchEngine" },
    consumer: "KnowledgeIncident + evidencia (mapa)",
    notes: "Grupo A.",
  },
  {
    id: "nasa_firms",
    name: "NASA FIRMS (focos térmicos satelitales)",
    category: "wildfire",
    coverage: "global",
    role: "detection",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 80,
    requiredEnv: ["NASA_FIRMS_MAP_KEY"],
    endpoint: "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{bbox}/{days}",
    timeoutMs: 15_000,
    scheduler: { intervalMinutes: 15, owner: "globalWatchEngine" },
    consumer: "KnowledgeIncident + evidencia (correlación de incendios, Prompt 15)",
    notes: "Grupo A. Observación satelital, requiere clave NASA.",
  },
  {
    id: "copernicus_effis",
    name: "Copernicus EFFIS (incendios Europa)",
    category: "wildfire",
    coverage: "regional",
    coverageDetail: "Europa / Mediterráneo",
    role: "confirmation",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 90,
    requiredEnv: [],
    endpoint: "https://maps.effis.emergency.copernicus.eu/effis (WFS GeoJSON)",
    timeoutMs: 40_000,
    scheduler: { intervalMinutes: 30, owner: "globalWatchEngine" },
    consumer: "KnowledgeIncident + evidencia (correlación de incendios, Prompt 15)",
    notes: "Grupo A. Perímetro institucional Copernicus; el WFS es lento (~30s), timeout externo generoso a propósito.",
  },
  {
    id: "copernicus_ems",
    name: "Copernicus Emergency Management Service",
    category: "multi_hazard",
    coverage: "global",
    role: "confirmation",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 91,
    requiredEnv: [],
    endpoint: "https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/",
    timeoutMs: 20_000,
    scheduler: { intervalMinutes: 60, owner: "globalWatchEngine" },
    consumer: "KnowledgeIncident + evidencia (correlación de incendios, Prompt 15)",
    notes: "Grupo A. Activación institucional, no observación primaria.",
  },
  {
    id: "reliefweb",
    name: "ReliefWeb (OCHA)",
    category: "humanitarian",
    coverage: "global",
    role: "detection",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 82,
    requiredEnv: ["RELIEFWEB_APP_NAME"],
    endpoint: "https://api.reliefweb.int/v2/reports",
    timeoutMs: 20_000,
    scheduler: { intervalMinutes: 30, owner: "globalWatchEngine" },
    consumer: "KnowledgeIncident + evidencia (mapa, notificaciones)",
    notes: "Grupo A.",
  },
  {
    id: "senapred_eventos",
    name: "SENAPRED Chile (alertas oficiales)",
    category: "multi_hazard",
    coverage: "national",
    coverageDetail: "CL",
    role: "detection",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 95,
    requiredEnv: [],
    endpoint: "senapred.cl AppSync (fetchChileOfficialAlertsRaw, cliente único — ver ARGUS_SENAPRED_CANONICAL_INGESTION.md)",
    timeoutMs: 20_000,
    scheduler: { intervalMinutes: 15, owner: "chile-alerts job (delegado desde globalWatchEngine bajo lock compartido)" },
    consumer: "KnowledgeIncident + evidencia (mapa, notificaciones)",
    managedByJob: "chile-alerts",
    notes: "Grupo A. Ingestión única consolidada (ver doc de referencia); Global Watch delega, no re-consulta.",
  },
  {
    id: "dmc_meteochile_mention",
    name: "DMC MeteoChile (citada por SENAPRED)",
    category: "severe_weather",
    coverage: "national",
    coverageDetail: "CL",
    role: "enrichment",
    executionMode: "context_only",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 90,
    requiredEnv: [],
    endpoint: "Sin feed directo; evidencia extraída del texto de alertas SENAPRED (extractDmcMentionEvidence)",
    timeoutMs: 5_000,
    consumer: "Evidencia adjunta al incidente SENAPRED relacionado",
    notes: "Sin feed propio por diseño (DMC_PROVIDER_STATUS=\"no_direct_feed\") — no es un candidato a programación independiente.",
  },
  {
    id: "open-meteo",
    name: "Open-Meteo (contexto meteorológico)",
    category: "weather_context",
    coverage: "global",
    role: "context",
    executionMode: "context_only",
    adapterStatus: "implemented",
    isOfficial: false,
    reliabilityScore: 75,
    requiredEnv: [],
    endpoint: "https://api.open-meteo.com/v1/forecast",
    timeoutMs: 15_000,
    consumer: "Contexto bajo demanda (enriquece un incidente/coordenada puntual), sin persistencia propia",
    notes: "Prompt 16 §21: nunca crea incidente, nunca se cuenta como detección, nunca se ejecuta globalmente sin coordenadas.",
  },
  {
    id: "news_evidence",
    name: "NewsEvidence (prensa curada, fuente secundaria)",
    category: "media_signal",
    coverage: "global",
    role: "context",
    executionMode: "manual",
    adapterStatus: "stub",
    isOfficial: false,
    reliabilityScore: 60,
    requiredEnv: [],
    endpoint: "Curación interna (/api/news-evidence); sin feed automático propio",
    timeoutMs: 5_000,
    consumer: "Evidencia curada manualmente, sin fetch automático",
    notes: "Distinto de GDELT (ver entrada `gdelt` abajo) — este id representa curaduría manual, no un adaptador real.",
  },
];

/**
 * Grupo C (mayormente) — adaptadores reales de `knowledge-intake` con
 * `fetch()` + timeout genuinos, pero sin normalización a `KnowledgeIncident`
 * ni persistencia idempotente conectada, por lo que hoy ninguno satisface
 * los criterios completos de Grupo B (Prompt 16 §8) — ver
 * `docs/operations/ARGUS_SOURCE_ACTIVATION_BACKLOG.md` para la brecha
 * específica de cada uno.
 */
const UNSCHEDULED_REAL_ADAPTERS: ArgusSourceDefinition[] = [
  {
    id: "nws",
    name: "NWS (National Weather Service, EE.UU.)",
    category: "severe_weather",
    coverage: "national",
    coverageDetail: "US",
    role: "detection",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 90,
    requiredEnv: [],
    endpoint: "https://api.weather.gov/alerts/active",
    timeoutMs: 20_000,
    consumer: "Ninguno automático (vista live/manual en /api/knowledge-intake/live/nws)",
    notes: "NWS_USER_AGENT opcional (fallback con advertencia si falta). Real y funcional; falta normalizador canónico + persistencia + dedup + tests de integración para calificar a Grupo B.",
  },
  {
    id: "noaa_coops",
    name: "NOAA CO-OPS (nivel del mar / meteorología costera)",
    category: "coastal_ocean",
    coverage: "national",
    coverageDetail: "US",
    role: "context",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 85,
    requiredEnv: [],
    endpoint: "NOAA CO-OPS API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Rol contextual (enriquecimiento costero) — no requiere Grupo B, candidato a `context_only` si se conecta a enriquecimiento de incidentes costeros existentes.",
  },
  {
    id: "noaa_ncei_tsunami",
    name: "NOAA NCEI Tsunami Events/Runups",
    category: "tsunami",
    coverage: "global",
    role: "historical",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 88,
    requiredEnv: [],
    endpoint: "NOAA NCEI Tsunami API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Histórico — no debe ejecutarse con cadencia live (Prompt 16 §9/§15).",
  },
  {
    id: "noaa_storm_events",
    name: "NOAA Storm Events Database",
    category: "severe_weather",
    coverage: "national",
    coverageDetail: "US",
    role: "historical",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 85,
    requiredEnv: [],
    endpoint: "NOAA Storm Events API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Histórico/retrasado por diseño — no candidato a cadencia live.",
  },
  {
    id: "ioc_slsmf",
    name: "IOC Sea Level Monitoring Facility",
    category: "coastal_ocean",
    coverage: "global",
    role: "enrichment",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 85,
    requiredEnv: ["IOC_SLSMF_API_KEY"],
    endpoint: "IOC SLSMF API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Enriquecimiento de contexto de nivel del mar para tsunami — sin credencial configurada hoy.",
  },
  {
    id: "openaq",
    name: "OpenAQ (calidad del aire)",
    category: "air_quality",
    coverage: "global",
    role: "context",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: false,
    reliabilityScore: 78,
    requiredEnv: ["OPENAQ_API_KEY"],
    endpoint: "OpenAQ API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Contexto de calidad del aire (relevante para humo de incendios) — sin credencial configurada hoy.",
  },
  {
    id: "hdx_hapi",
    name: "HDX/OCHA HAPI",
    category: "humanitarian",
    coverage: "global",
    role: "enrichment",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 82,
    requiredEnv: ["HAPI_APP_IDENTIFIER"],
    endpoint: "HDX HAPI API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Enriquecimiento de exposición poblacional para crisis humanitarias — sin credencial configurada hoy.",
  },
  {
    id: "who_don",
    name: "WHO Disease Outbreak News",
    category: "public_health",
    coverage: "global",
    role: "detection",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 90,
    requiredEnv: [],
    endpoint: "WHO DON RSS/XML",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Real y sin credenciales — falta normalizador canónico + persistencia + tests para Grupo B. Prioridad alta (§9: salud pública).",
  },
  {
    id: "ecdc",
    name: "ECDC (European CDC)",
    category: "public_health",
    coverage: "regional",
    coverageDetail: "Europa",
    role: "confirmation",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 90,
    requiredEnv: [],
    endpoint: "ECDC API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Corrobora WHO DON para Europa vía `ecdcWhoDonDedupe.ts` (clave cruzada existente, nadie la invoca automáticamente).",
  },
  {
    id: "copernicus_glofas",
    name: "Copernicus GloFAS (pronóstico fluvial)",
    category: "flood",
    coverage: "global",
    role: "detection",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: ["COPERNICUS_EWDS_API_KEY"],
    endpoint: "Copernicus EWDS API (nunca invocada — ver notas)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes:
      "Corrección de re-auditoría (Prompt 16 §2: no confiar ciegamente en la matriz previa): " +
      "`fetchGlofasForecastMetadata()`/`fetchGlofasForecastSubset()` construyen la URL de la petición y validan " +
      "parámetros, pero no contienen ninguna llamada `fetch()` real (confirmado por grep en el archivo) — siempre " +
      "retornan `status:\"prepared\", records:[]` con la advertencia explícita en el propio código " +
      "\"heavy NetCDF/GRIB subset parsing is deferred\", incluso con credencial configurada. Esto cumple la " +
      "definición de `stub` (\"no ejecuta ninguna consulta real\"), no la de `implemented`, aunque el archivo no " +
      "use literalmente `plannedAdapterResult`. Reclasificado de \"implemented\" a \"stub\" en esta tarea.",
  },
  {
    id: "copernicus_gfm",
    name: "Global Flood Monitoring (Copernicus GFM)",
    category: "flood",
    coverage: "global",
    role: "detection",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 86,
    requiredEnv: ["COPERNICUS_GFM_ACCESS_TOKEN"],
    endpoint: "Copernicus GFM API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Sin credencial configurada hoy.",
  },
  {
    id: "smithsonian_gvp",
    name: "Smithsonian Global Volcanism Program",
    category: "volcanic",
    coverage: "global",
    role: "detection",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 90,
    requiredEnv: [],
    endpoint: "Smithsonian GVP WFS",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Real y sin credenciales; también expone un modo de importación de catálogo histórico (`jobs/import-smithsonian-gvp-catalog`), rol `historical` para ese modo.",
  },
  {
    id: "usgs_earthquake_impact",
    name: "USGS PAGER / ShakeMap (impacto sísmico)",
    category: "earthquake",
    coverage: "global",
    role: "enrichment",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 92,
    requiredEnv: [],
    endpoint: "USGS Event Products API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático (enriquecería un KnowledgeIncident de sismo ya existente, nunca crea uno nuevo)",
    notes: "Prompt 16 §9 ejemplo explícito: enriquece un sismo existente, no debe crear un segundo incidente.",
  },
  {
    id: "openfema",
    name: "OpenFEMA (declaraciones de desastre, EE.UU.)",
    category: "historical_declaration",
    coverage: "national",
    coverageDetail: "US",
    role: "historical",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 88,
    requiredEnv: [],
    endpoint: "OpenFEMA API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Prompt 16 §9 ejemplo explícito: histórico/declarativo, no fuente live.",
  },
  {
    id: "usgs_water",
    name: "USGS Water Data",
    category: "hydrology",
    coverage: "national",
    coverageDetail: "US",
    role: "enrichment",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 85,
    requiredEnv: [],
    endpoint: "USGS Water Services API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "`USGS_WATER_API_KEY` opcional (solo eleva límite de tasa, no bloquea ejecución).",
  },
  {
    id: "usgs_volcano_hans",
    name: "USGS Volcano HANS",
    category: "volcanic",
    coverage: "national",
    coverageDetail: "US",
    role: "detection",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 88,
    requiredEnv: [],
    endpoint: "USGS Volcano HANS feed",
    timeoutMs: 20_000,
    consumer: "Ninguno automático",
    notes: "Real y sin credenciales.",
  },
  {
    id: "osm_overpass",
    name: "OpenStreetMap / Overpass",
    category: "critical_infrastructure",
    coverage: "global",
    role: "context",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: false,
    reliabilityScore: 70,
    requiredEnv: [],
    endpoint: "Overpass API",
    timeoutMs: 20_000,
    consumer: "Ninguno automático fuera de `/api/critical-pois/sync` (uso puntual bajo bbox validado, no cadencia)",
    notes: "Ya usado bajo demanda por `critical-pois/sync` (Prompt 12, con guard de bbox) — no es un candidato a cadencia periódica.",
  },
  {
    id: "gdelt",
    name: "GDELT DOC 2.0 (señal de cobertura mediática)",
    category: "media_signal",
    coverage: "global",
    role: "context",
    executionMode: "manual",
    adapterStatus: "implemented",
    isOfficial: false,
    reliabilityScore: 55,
    requiredEnv: [],
    endpoint: "https://api.gdeltproject.org/api/v2/doc/doc",
    timeoutMs: 15_000,
    consumer: "Ninguno automático (preview/persist manual vía /api/knowledge-intake/live/gdelt)",
    notes:
      "Prompt 16 §20: el adaptador SÍ es funcional (fetch real, timeout 12s) — la caracterización previa de \"roto\" en la auditoría se refería al caso `news_evidence` de `globalWatchEngine.ts` (que siempre devuelve 0 sin tocar GDELT), no a `gdeltAdapter.ts` en sí. Rol asignado: `context` (señal de cobertura mediática), nunca `detection` — no debe convertir cada noticia en incidente.",
  },
];

/** Grupo C — stubs de `knowledge-intake/adapters` sin ninguna consulta real (`plannedAdapterResult`). */
const STUB_ADAPTERS: ArgusSourceDefinition[] = [
  {
    id: "conaset_chile",
    name: "CONASET (seguridad de tránsito, Chile)",
    category: "transport",
    coverage: "national",
    coverageDetail: "CL",
    role: "historical",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin implementar (plannedAdapterResult)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Stub — no implementar en esta tarea (Prompt 16 §23).",
  },
  {
    id: "senapred_chile_knowledge_intake_stub",
    name: "SENAPRED (stub legacy de knowledge-intake)",
    category: "multi_hazard",
    coverage: "national",
    coverageDetail: "CL",
    role: "historical",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin implementar (plannedAdapterResult)",
    timeoutMs: 0,
    consumer: "Ninguno — superado por `senapred_eventos` (real, programado)",
    notes: "Distinto del adaptador real usado por Global Watch/Chile Alerts (`senapred_eventos`). Cero riesgo, cero consumidor.",
  },
  {
    id: "csb_global",
    name: "US Chemical Safety Board",
    category: "industrial_accident",
    coverage: "national",
    coverageDetail: "US",
    role: "historical",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin implementar (plannedAdapterResult)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Stub.",
  },
  {
    id: "iaea_global",
    name: "IAEA (incidentes nucleares/radiológicos)",
    category: "nuclear_radiological",
    coverage: "global",
    role: "detection",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin implementar (plannedAdapterResult)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Stub.",
  },
  {
    id: "ntsb_global",
    name: "NTSB (investigación de accidentes de transporte, EE.UU.)",
    category: "transport",
    coverage: "national",
    coverageDetail: "US",
    role: "historical",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin implementar (plannedAdapterResult)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Stub.",
  },
  {
    id: "nhtsa_global",
    name: "NHTSA (seguridad vehicular, EE.UU.)",
    category: "transport",
    coverage: "national",
    coverageDetail: "US",
    role: "historical",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin implementar (plannedAdapterResult)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Stub.",
  },
  {
    id: "desinventar_global",
    name: "DesInventar (base histórica de desastres)",
    category: "historical_declaration",
    coverage: "global",
    role: "historical",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin implementar (plannedAdapterResult)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Stub.",
  },
  {
    id: "emdat_global",
    name: "EM-DAT (base histórica de desastres)",
    category: "historical_declaration",
    coverage: "global",
    role: "historical",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin implementar (plannedAdapterResult)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Stub.",
  },
];

/** Grupo C — fuentes oficiales chilenas sin ningún código de ingestión (`status: "requires_parser"` en `chile.ts`). */
const CHILE_UNCONNECTED_SOURCES: ArgusSourceDefinition[] = [
  {
    id: "csn_chile",
    name: "Centro Sismológico Nacional (Chile)",
    category: "earthquake",
    coverage: "national",
    coverageDetail: "CL",
    role: "confirmation",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin adaptador (requires_parser en src/data/countrySourcePacks/chile.ts)",
    timeoutMs: 0,
    consumer: "Ninguno — sin código de ingestión",
    notes: "Institución real y autoritativa; ARGUS no tiene job de ingestión implementado todavía.",
  },
  {
    id: "shoa_chile",
    name: "SHOA (Servicio Hidrográfico y Oceanográfico de la Armada)",
    category: "coastal_ocean",
    coverage: "national",
    coverageDetail: "CL",
    role: "confirmation",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin adaptador (requires_parser)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Sin código de ingestión.",
  },
  {
    id: "sernageomin_chile",
    name: "SERNAGEOMIN (geología/volcanes, Chile)",
    category: "volcanic",
    coverage: "national",
    coverageDetail: "CL",
    role: "confirmation",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin adaptador (requires_parser)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Sin código de ingestión.",
  },
  {
    id: "mop_vialidad_chile",
    name: "Dirección de Vialidad (MOP, Chile)",
    category: "infrastructure",
    coverage: "national",
    coverageDetail: "CL",
    role: "context",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin adaptador (requires_parser)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Sin código de ingestión.",
  },
  {
    id: "dga_chile",
    name: "DGA (Dirección General de Aguas, Chile)",
    category: "hydrology",
    coverage: "national",
    coverageDetail: "CL",
    role: "context",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin adaptador (requires_parser)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Sin código de ingestión.",
  },
  {
    id: "conaf_chile",
    name: "CONAF (Corporación Nacional Forestal, Chile)",
    category: "wildfire",
    coverage: "national",
    coverageDetail: "CL",
    role: "confirmation",
    executionMode: "disabled",
    adapterStatus: "stub",
    isOfficial: true,
    reliabilityScore: 0,
    requiredEnv: [],
    endpoint: "Sin adaptador (requires_parser en chile.ts)",
    timeoutMs: 0,
    consumer: "Ninguno",
    notes: "Fusiona dos referencias previamente separadas (paquete de fuentes chilenas + stub global `conafAdapter.ts`, retirado en el Prompt 20 por no tener consumidor) en una sola fila — mismo hecho operativo: cero código de ingestión.",
  },
];

export const ARGUS_SOURCE_OPERATIONS_REGISTRY: ArgusSourceDefinition[] = [
  ...SCHEDULED_SOURCES,
  ...UNSCHEDULED_REAL_ADAPTERS,
  ...STUB_ADAPTERS,
  ...CHILE_UNCONNECTED_SOURCES,
];

export function getSourceDefinition(id: string): ArgusSourceDefinition | undefined {
  return ARGUS_SOURCE_OPERATIONS_REGISTRY.find((source) => source.id === id);
}

export function isSourceConfigured(source: ArgusSourceDefinition): boolean {
  return source.requiredEnv.every((name) => Boolean(process.env[name]?.trim()));
}

// ---------------------------------------------------------------------------
// Señal de salud dinámica + derivación de estado operacional (Prompt 16 §17-19)
// ---------------------------------------------------------------------------

export type SourceHealthSignal = {
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastDurationMs: number | null;
  lastRecordCount: number | null;
  /** Fallos consecutivos más recientes primero (0 si la última corrida tuvo éxito). */
  consecutiveFailures: number;
  lastErrorCode: SourceErrorCode | null;
  credentialsConfigured: boolean;
};

export const EMPTY_HEALTH_SIGNAL: SourceHealthSignal = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastDurationMs: null,
  lastRecordCount: null,
  consecutiveFailures: 0,
  lastErrorCode: null,
  credentialsConfigured: true,
};

/** Umbral de fallos consecutivos a partir del cual una fuente programada pasa de `degraded` a `broken` (Prompt 16 §18). */
export const BROKEN_CONSECUTIVE_FAILURES_THRESHOLD = 5;

/** Multiplicador sobre `intervalMinutes` tras el cual un último éxito se considera "obsoleto" (degradado) aunque no haya fallos registrados. */
export const STALE_SUCCESS_INTERVAL_MULTIPLIER = 3;

export type SourceOperationalVerdict = {
  status: SourceOperationalStatus;
  reason: string;
};

/**
 * Deriva el estado operacional de una fuente (Prompt 16 §5, §18, §19).
 * Determinista y pura — no consulta base de datos ni red; recibe `now` y la
 * señal ya calculada. Orden de evaluación: capacidad estática primero
 * (disabled/stub/broken/missing_credentials no dependen de la señal),
 * después el comportamiento dinámico observado.
 */
export function deriveSourceOperationalStatus(
  source: ArgusSourceDefinition,
  signal: SourceHealthSignal,
  now: Date
): SourceOperationalVerdict {
  // `stub` se evalúa antes que `disabled`: un adaptador sin implementación
  // real es más específico y más informativo que "desactivado
  // intencionalmente" — todas las entradas de `STUB_ADAPTERS`/
  // `CHILE_UNCONNECTED_SOURCES` combinan `adapterStatus: "stub"` con
  // `executionMode: "disabled"`, y deben leerse como `stub` (Prompt 16 Caso
  // 5), no como una fuente real que alguien apagó a propósito.
  if (source.adapterStatus === "stub") {
    return { status: "stub", reason: "No existe implementación real (plannedAdapterResult o sin código de fetch)." };
  }
  if (source.executionMode === "disabled") {
    return { status: "disabled", reason: "Fuente desactivada intencionalmente en el registro." };
  }
  if (source.adapterStatus === "broken") {
    return { status: "broken", reason: "El adaptador está marcado como estructuralmente roto en el registro." };
  }
  if (source.requiredEnv.length > 0 && !signal.credentialsConfigured) {
    return { status: "missing_credentials", reason: `Faltan variables de entorno: ${source.requiredEnv.join(", ")}.` };
  }

  // Fallos consecutivos observados en tiempo de ejecución pueden degradar o
  // romper una fuente cuyo adaptador está bien implementado en el registro
  // (p. ej. un endpoint retirado por el proveedor) — el estado dinámico
  // puede ser más severo que la capacidad estática, nunca más optimista.
  if (signal.consecutiveFailures >= BROKEN_CONSECUTIVE_FAILURES_THRESHOLD) {
    return {
      status: "broken",
      reason: `${signal.consecutiveFailures} fallos consecutivos — ejecución estructuralmente imposible en la práctica.`,
    };
  }

  if (source.executionMode === "context_only") {
    if (signal.consecutiveFailures > 0) {
      return { status: "degraded", reason: `${signal.consecutiveFailures} fallo(s) reciente(s) en invocaciones bajo demanda.` };
    }
    // Sin historial de fallos, un context_only nunca se declara "fallido"
    // por no tener cadencia propia (Prompt 16 §10, §14).
    return { status: "operational", reason: "Fuente de contexto disponible bajo demanda; sin fallos recientes." };
  }

  if (source.executionMode === "manual") {
    // Distinción observable, no un campo de intención adicional en el
    // registro (Prompt 16 Casos 2 y 3): sin ninguna evidencia de ejecución
    // todavía, es un adaptador listo pero nunca invocado ("configurado, sin
    // programar"); con al menos un intento manual registrado, está
    // genuinamente en uso, solo que exclusivamente por acción de operador.
    if (!signal.lastAttemptAt) {
      return {
        status: "configured_not_scheduled",
        reason: "Adaptador implementado, sin scheduler, y sin evidencia de ejecución todavía.",
      };
    }
    return { status: "manual_only", reason: "Se ejecuta únicamente vía endpoint/acción de operador; sin scheduler." };
  }

  // executionMode === "scheduled" a partir de aquí.
  if (!signal.lastAttemptAt) {
    return { status: "degraded", reason: "Programada pero sin evidencia de ejecución todavía (awaiting_first_run)." };
  }
  if (!source.scheduler) {
    return { status: "configured_not_scheduled", reason: "Adaptador listo pero sin definición de scheduler en el registro." };
  }
  if (signal.consecutiveFailures > 0) {
    return { status: "degraded", reason: `${signal.consecutiveFailures} fallo(s) consecutivo(s) reciente(s).` };
  }
  if (signal.lastSuccessAt) {
    const staleAfterMs = source.scheduler.intervalMinutes * STALE_SUCCESS_INTERVAL_MULTIPLIER * 60_000;
    const ageMs = now.getTime() - signal.lastSuccessAt.getTime();
    if (ageMs > staleAfterMs) {
      return { status: "degraded", reason: `Último éxito hace ${Math.round(ageMs / 60_000)} min, supera ${STALE_SUCCESS_INTERVAL_MULTIPLIER}x el intervalo esperado.` };
    }
    return { status: "operational", reason: "Programada, configurada, con ejecución exitosa reciente." };
  }
  return { status: "degraded", reason: "Se registran intentos pero ningún éxito confirmado todavía." };
}

// ---------------------------------------------------------------------------
// Proyecciones público / operador (Prompt 16 §17, §25)
// ---------------------------------------------------------------------------

export type PublicSourceHealthLevel = "available" | "degraded" | "unavailable";

const PUBLIC_LEVEL_BY_STATUS: Record<SourceOperationalStatus, PublicSourceHealthLevel> = {
  operational: "available",
  degraded: "degraded",
  configured_not_scheduled: "unavailable",
  manual_only: "unavailable",
  missing_credentials: "unavailable",
  not_configured: "unavailable",
  stub: "unavailable",
  broken: "unavailable",
  disabled: "unavailable",
  retired: "unavailable",
};

export type PublicSourceHealthEntry = {
  id: string;
  category: string;
  role: SourceRole;
  level: PublicSourceHealthLevel;
};

/** Vista pública — nunca expone errores, URLs, credenciales, timestamps exactos ni conteos (Prompt 16 §17, §25). */
export function toPublicSourceHealth(source: ArgusSourceDefinition, verdict: SourceOperationalVerdict): PublicSourceHealthEntry {
  return {
    id: source.id,
    category: source.category,
    role: source.role,
    level: PUBLIC_LEVEL_BY_STATUS[verdict.status],
  };
}

export type OperatorSourceHealthEntry = {
  sourceId: string;
  name: string;
  category: string;
  coverage: ArgusSourceDefinition["coverage"];
  role: SourceRole;
  executionMode: SourceExecutionMode;
  adapterStatus: SourceAdapterStatus;
  operationalStatus: SourceOperationalStatus;
  statusReason: string;
  isOfficial: boolean;
  reliabilityScore: number;
  credentialsConfigured: boolean;
  schedulerConfigured: boolean;
  intervalMinutes: number | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  lastRecordCount: number | null;
  consecutiveFailures: number;
  errorCode: SourceErrorCode | null;
  nextScheduledAt: string | null;
  consumer: string;
  managedByJob?: string;
};

/**
 * Vista de operador — puede incluir tiempos/errores normalizados/conteos,
 * pero nunca secretos, tokens, URLs privadas con claves embebidas, payloads
 * ni stack traces (Prompt 16 §17). `endpoint` se omite deliberadamente aquí
 * porque varias entradas del registro incrustan la URL pública del
 * proveedor sin secretos, pero no hay necesidad operativa de exponerla en
 * este endpoint — el registro fuente (no este DTO) es donde se audita.
 */
export function toOperatorSourceHealth(
  source: ArgusSourceDefinition,
  signal: SourceHealthSignal,
  verdict: SourceOperationalVerdict
): OperatorSourceHealthEntry {
  const nextScheduledAt =
    source.scheduler && signal.lastAttemptAt
      ? new Date(signal.lastAttemptAt.getTime() + source.scheduler.intervalMinutes * 60_000).toISOString()
      : null;
  return {
    sourceId: source.id,
    name: source.name,
    category: source.category,
    coverage: source.coverage,
    role: source.role,
    executionMode: source.executionMode,
    adapterStatus: source.adapterStatus,
    operationalStatus: verdict.status,
    statusReason: verdict.reason,
    isOfficial: source.isOfficial,
    reliabilityScore: source.reliabilityScore,
    credentialsConfigured: signal.credentialsConfigured,
    schedulerConfigured: Boolean(source.scheduler),
    intervalMinutes: source.scheduler?.intervalMinutes ?? null,
    lastAttemptAt: signal.lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: signal.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: signal.lastFailureAt?.toISOString() ?? null,
    lastDurationMs: signal.lastDurationMs,
    lastRecordCount: signal.lastRecordCount,
    consecutiveFailures: signal.consecutiveFailures,
    errorCode: signal.lastErrorCode,
    nextScheduledAt,
    consumer: source.consumer,
    managedByJob: source.managedByJob,
  };
}
