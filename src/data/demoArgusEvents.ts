/**
 * Chile pilot case: southern-Chile frontal system (2026-07-07).
 *
 * Both events are built through the same normalizer/correlation pipeline a
 * real `chileAdapter.ts` would use — the only thing that's "demo" here is
 * that the input signals are curated by hand instead of fetched live from
 * SENAPRED/DMC/regional press. Event 1 models Caso A (direct official
 * consumption); Event 2 models Caso B (regional press citing an authority).
 */
import type { ArgusEvent } from "@/types/argusEvent";
import { correlateSignals } from "@/lib/correlation/argusCorrelationEngine";
import type { ArgusSignal } from "@/lib/normalizers/argusEventNormalizer";
import { chileSources } from "@/data/countrySourcePacks/chile";

function requireSource(id: string) {
  const source = chileSources.find((entry) => entry.id === id);
  if (!source) throw new Error(`Unknown Chile source id: ${id}`);
  return source;
}

const senapred = requireSource("cl_senapred");
const dmc = requireSource("cl_dmc_meteochile");
const mopVialidad = requireSource("cl_mop_vialidad");
const diarioValdivia = requireSource("cl_news_diario_valdivia");

const PUBLISHED_AT = "2026-07-07T09:00:00-04:00";

/**
 * Approximate corridor covering La Araucanía / Los Ríos / Los Lagos — there
 * is no official polygon behind this shape, it is a hand-estimated buffer
 * around the affected regions (`geometryPrecision: "polygon_estimated"`),
 * not a claim of administrative-boundary precision.
 */
const southernChileCorridor: Array<[number, number]> = [
  [-37.85, -73.3],
  [-37.85, -71.4],
  [-40.9, -71.6],
  [-41.6, -72.6],
  [-41.6, -73.9],
  [-39.0, -74.0],
];

const signals: ArgusSignal[] = [
  {
    kind: "official_alert",
    country: "CL",
    region: "La Araucanía, Los Ríos, Los Lagos",
    eventType: "RISK_ZONE",
    severity: "high",
    status: "risk",
    title: "Sistema frontal severo en el sur de Chile",
    operationalSummary:
      "Sistema frontal con precipitaciones intensas en el sur de Chile. Riesgo de anegamientos, remociones en masa y cortes de ruta. Mantener vigilancia sobre rutas costeras, cauces y zonas de pendiente.",
    geometry: {
      type: "region_reference",
      anchor: [-39.8142, -73.2459],
      regionNames: ["La Araucanía", "Los Ríos", "Los Lagos"],
      polygonEstimate: southernChileCorridor,
    },
    geometryPrecision: "polygon_estimated",
    publishedAt: PUBLISHED_AT,
    validFrom: PUBLISHED_AT,
    validUntil: "2026-07-09T09:00:00-04:00",
    recommendedActions: [
      "Evitar desplazamientos innecesarios.",
      "Monitorear rutas y cortes.",
      "Evitar cruces de cauces crecidos.",
      "Revisar canales oficiales (SENAPRED, DMC).",
      "Preparar mochila de emergencia si la zona está bajo alerta.",
      "Mantener batería/celular/radio cargados.",
      "Seguir instrucciones de autoridades.",
    ],
    tags: ["lluvia_intensa", "anegamiento", "remocion_en_masa", "corte_de_ruta"],
    sources: [senapred, dmc],
    isDemo: true,
  },
  {
    kind: "news_mention",
    country: "CL",
    region: "Los Ríos",
    commune: "Corral",
    eventType: "LANDSLIDE",
    severity: "high",
    status: "active",
    title: "Material sobre la ruta costera hacia Corral, Región de Los Ríos",
    operationalSummary:
      "Prensa regional reporta material y barro sobre la ruta costera de acceso a Corral, en el marco del sistema frontal que afecta a Los Ríos. Vialidad (MOP) es mencionado como autoridad a cargo del despeje. Pendiente confirmación oficial directa.",
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
];

export const demoArgusEvents: ArgusEvent[] = correlateSignals(signals);
