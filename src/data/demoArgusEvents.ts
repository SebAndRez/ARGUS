/**
 * Chile pilot case: southern-Chile frontal system (2026-07-06/07).
 *
 * All events are built through the same normalizer/correlation pipeline a
 * real live-ingestion job would use — the only thing that's "demo" here is
 * that the input signals are curated by hand instead of fetched at request
 * time via `@/lib/adapters/senapred/senapredEventosAdapter`. Event 1 models
 * Caso A (direct official consumption): its title/content is transcribed
 * from SENAPRED's actual live `alertasByDate` records for La Araucanía, Los
 * Ríos and Los Lagos (Alerta Amarilla, declared 2026-07-06, last monitoreo
 * 2026-07-07), confirmed via a live signed AppSync query against
 * SENAPRED's own AWS AppSync GraphQL API. Events 2+ model Caso B (regional
 * press citing an authority) for named Los Ríos subzones — SENAPRED's own
 * alert records carry no comuna/provincia breakdown for this event, so
 * subzone-level detail is never attributed to SENAPRED itself.
 */
import type { ArgusEvent } from "@/types/argusEvent";
import { correlateSignals } from "@/lib/correlation/argusCorrelationEngine";
import type { ArgusSignal } from "@/lib/normalizers/argusEventNormalizer";
import { chileSources } from "@/data/countrySourcePacks/chile";
import { resolveAdministrativeRegionGeometry } from "@/lib/geometry/argusGeometryResolver";

function requireSource(id: string) {
  const source = chileSources.find((entry) => entry.id === id);
  if (!source) throw new Error(`Unknown Chile source id: ${id}`);
  return source;
}

const senapred = requireSource("senapred_eventos");
const dmc = requireSource("cl_dmc_meteochile");
const mopVialidad = requireSource("cl_mop_vialidad");
const sernageomin = requireSource("cl_sernageomin");
const diarioValdivia = requireSource("cl_news_diario_valdivia");
const losRiosLocal = requireSource("cl_news_losrios_local");

/** Earliest of the three regions' "Se declara Alerta Amarilla" records. */
const VALID_FROM = "2026-07-06T13:34:00-04:00";
/** Most recent of the three regions' monitoreo updates (Los Ríos). */
const PUBLISHED_AT = "2026-07-07T16:31:00-04:00";

/**
 * Real administrative boundaries for La Araucanía / Los Ríos / Los Lagos,
 * merged from `src/data/geometries/chileRegions.json` (geoBoundaries CHL
 * ADM1, sourced from BCN / OCHA ROLAC) — never a hand-drawn or bbox shape.
 * The anchor is kept near Valdivia for camera-centering only; it does not
 * affect the rendered polygon.
 */
const southernChileRegionGeometry = resolveAdministrativeRegionGeometry(
  "CL",
  ["La Araucanía", "Los Ríos", "Los Lagos"],
  { anchorOverride: [-39.8142, -73.2459] }
);
if (!southernChileRegionGeometry) {
  throw new Error("Failed to resolve real geometry for La Araucanía / Los Ríos / Los Lagos");
}

const signals: ArgusSignal[] = [
  {
    kind: "official_alert",
    country: "CL",
    region: "La Araucanía, Los Ríos, Los Lagos",
    eventType: "SEVERE_WEATHER",
    severity: "medium",
    status: "risk",
    title: "Alerta Amarilla SENAPRED por evento meteorológico en La Araucanía, Los Ríos y Los Lagos",
    operationalSummary:
      "SENAPRED mantiene Alerta Amarilla Regional por evento meteorológico para La Araucanía, Los Ríos y Los Lagos, declarada el 06-07-2026 y monitoreada hasta el 07-07-2026, en base a los alertamientos de la Dirección Meteorológica de Chile (DMC): precipitaciones intensas con isoterma 0°C alta, viento normal a moderado con ráfagas y probables tormentas eléctricas entre el 07 y 08 de julio. Para Los Ríos, SERNAGEOMIN indica mediante Minuta Técnica que la posibilidad de aluviones (flujos de detritos) y derrumbes (deslizamientos, caída de rocas) es alta en toda la región. Se mantienen recursos alistados escalonadamente para intervenir según evolución del evento.",
    geometry: { type: "administrative_area", ...southernChileRegionGeometry },
    geometryPrecision: "polygon_administrative",
    publishedAt: PUBLISHED_AT,
    validFrom: VALID_FROM,
    validUntil: "2026-07-08T23:59:00-04:00",
    recommendedActions: [
      "Evitar desplazamientos innecesarios.",
      "Monitorear rutas y cortes.",
      "Evitar cruces de cauces crecidos.",
      "Revisar canales oficiales (SENAPRED, DMC, SERNAGEOMIN).",
      "Preparar mochila de emergencia si la zona está bajo alerta.",
      "Mantener batería/celular/radio cargados.",
      "Seguir instrucciones de autoridades.",
    ],
    tags: ["lluvia_intensa", "anegamiento", "remocion_en_masa", "corte_de_ruta", "alerta_amarilla"],
    sources: [senapred, dmc, sernageomin],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Costa de Valdivia",
    eventType: "HEAVY_RAIN",
    severity: "medium",
    status: "active",
    title: "Anegamientos en sectores costeros de Valdivia por sistema frontal",
    operationalSummary:
      "Prensa regional reporta anegamientos y calles con agua acumulada en sectores costeros de Valdivia, en el marco de la Alerta Amarilla vigente para Los Ríos. Pendiente confirmación oficial directa.",
    geometry: { type: "point", coordinates: [-39.8367, -73.31] },
    geometryPrecision: "approximate_point",
    publishedAt: "2026-07-07T12:00:00-04:00",
    recommendedActions: ["Evitar sectores anegados.", "No transitar por calles con agua acumulada.", "Priorizar rutas alternativas."],
    tags: ["anegamiento", "costa_valdivia"],
    sources: [diarioValdivia],
    officialAuthorityMentioned: [senapred.name],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Curiñanco",
    eventType: "LANDSLIDE",
    severity: "high",
    status: "active",
    title: "Material sobre el camino a Curiñanco por remoción en masa",
    operationalSummary:
      "Prensa regional reporta material y derrumbe parcial sobre el camino de acceso a Curiñanco, consistente con el riesgo alto de remoción en masa señalado por SERNAGEOMIN para Los Ríos. Vialidad (MOP) mencionado como autoridad a cargo del despeje. Pendiente confirmación oficial directa.",
    geometry: { type: "point", coordinates: [-39.7, -73.39] },
    geometryPrecision: "approximate_point",
    publishedAt: "2026-07-07T12:45:00-04:00",
    recommendedActions: ["Evitar laderas y taludes.", "No cruzar zonas con material.", "Reportar cortes o derrumbes."],
    tags: ["material_sobre_camino", "remocion_en_masa", "camino_curinanco"],
    sources: [diarioValdivia],
    officialAuthorityMentioned: [mopVialidad.name, sernageomin.name],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Corral",
    eventType: "LANDSLIDE",
    severity: "high",
    status: "confirmed",
    title: "Corte confirmado en la ruta costera hacia Corral, Región de Los Ríos",
    operationalSummary:
      "Prensa regional confirma corte de tránsito por material y barro sobre la ruta costera de acceso a Corral, en el marco del sistema frontal que afecta a Los Ríos. Vialidad (MOP) es mencionado como autoridad a cargo del despeje. Pendiente confirmación oficial directa.",
    geometry: { type: "point", coordinates: [-39.8833, -73.4333] },
    geometryPrecision: "approximate_point",
    publishedAt: "2026-07-07T13:30:00-04:00",
    recommendedActions: [
      "Evitar laderas, quebradas, taludes y rutas con material.",
      "No cruzar zonas con barro activo.",
      "Reportar cortes o material sobre caminos.",
      "Priorizar rutas alternativas.",
    ],
    tags: ["material_sobre_camino", "corte_de_ruta", "ruta_corral_valdivia"],
    sources: [diarioValdivia],
    officialAuthorityMentioned: [mopVialidad.name],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Las Lajas",
    eventType: "ROAD_CLOSURE",
    severity: "medium",
    status: "active",
    title: "Ruta a Las Lajas con tránsito restringido por material sobre la calzada",
    operationalSummary:
      "Prensa regional reporta tránsito restringido en el sector Las Lajas, en el corredor costero de Los Ríos, por acumulación de material producto de las precipitaciones. Pendiente confirmación oficial directa.",
    geometry: { type: "point", coordinates: [-39.86, -73.4] },
    geometryPrecision: "approximate_point",
    publishedAt: "2026-07-07T13:50:00-04:00",
    recommendedActions: ["Priorizar rutas alternativas.", "Reducir velocidad en sectores con material."],
    tags: ["corte_de_ruta", "las_lajas"],
    sources: [diarioValdivia],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Mehuín",
    eventType: "FLOOD",
    severity: "medium",
    status: "active",
    title: "Anegamientos costeros reportados en Mehuín",
    operationalSummary:
      "Medios locales reportan anegamientos en sectores bajos de Mehuín asociados al sistema frontal vigente en Los Ríos. Pendiente confirmación oficial directa.",
    geometry: { type: "point", coordinates: [-39.4167, -73.2167] },
    geometryPrecision: "approximate_point",
    publishedAt: "2026-07-07T14:10:00-04:00",
    recommendedActions: ["Evitar sectores bajos anegados.", "Monitorear crecidas de esteros locales."],
    tags: ["anegamiento", "mehuin"],
    sources: [losRiosLocal],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Queule",
    eventType: "ROAD_CLOSURE",
    severity: "medium",
    status: "active",
    title: "Camino hacia Queule con presencia de material tras precipitaciones",
    operationalSummary:
      "Medios locales reportan material sobre la calzada en el camino de acceso a Queule, en el límite norte de Los Ríos. Pendiente confirmación oficial directa.",
    geometry: { type: "point", coordinates: [-39.38, -73.2] },
    geometryPrecision: "approximate_point",
    publishedAt: "2026-07-07T14:20:00-04:00",
    recommendedActions: ["Priorizar rutas alternativas.", "Reportar cortes o material sobre caminos."],
    tags: ["corte_de_ruta", "camino_queule"],
    sources: [losRiosLocal],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Panguipulli",
    eventType: "LANDSLIDE",
    severity: "medium",
    status: "active",
    title: "Sector de Cerro Huequecura bajo monitoreo por riesgo de remoción en masa",
    operationalSummary:
      "Medios locales reportan monitoreo del sector de Cerro Huequecura, en la precordillera de Los Ríos, por riesgo de remoción en masa consistente con la Minuta Técnica de SERNAGEOMIN. Coordenada aproximada — ARGUS no cuenta con datos oficiales de ubicación exacta para este sector. Pendiente confirmación oficial directa.",
    geometry: { type: "point", coordinates: [-39.75, -72.15] },
    geometryPrecision: "approximate_point",
    publishedAt: "2026-07-07T14:35:00-04:00",
    recommendedActions: ["Evitar laderas y quebradas.", "Monitorear canales oficiales (SERNAGEOMIN, SENAPRED)."],
    tags: ["remocion_en_masa", "cerro_huequecura"],
    sources: [losRiosLocal],
    officialAuthorityMentioned: [sernageomin.name],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Panguipulli",
    eventType: "HEAVY_RAIN",
    severity: "medium",
    status: "risk",
    title: "Panguipulli bajo vigilancia por crecida de cauces y precipitaciones",
    operationalSummary:
      "Medios locales reportan vigilancia sobre cauces y el lago Panguipulli por las precipitaciones intensas asociadas a la Alerta Amarilla vigente en Los Ríos. Pendiente confirmación oficial directa.",
    geometry: { type: "point", coordinates: [-39.6392, -72.3339] },
    geometryPrecision: "approximate_point",
    publishedAt: "2026-07-07T14:40:00-04:00",
    recommendedActions: ["Evitar cruces de cauces crecidos.", "Monitorear nivel del lago y esteros locales."],
    tags: ["crecida", "panguipulli"],
    sources: [losRiosLocal],
    isDemo: true,
  },
];

export const demoArgusEvents: ArgusEvent[] = correlateSignals(signals);
