import { createRiskProjection } from "@/lib/riskProjection";
import type {
  HazardOrigin,
  RiskProjection,
  WeatherObservation,
} from "@/types/weatherRisk";

export const demoWeatherObservations: WeatherObservation[] = [
  {
    id: "weather-santiago-centro",
    label: "Viento demo Santiago Centro",
    latitude: -33.4489,
    longitude: -70.6693,
    sourceType: "demo",
    sourceName: "ARGUS GRID demo local",
    observedAtLabel: "Actualización demo hace 4 min",
    temperatureC: 22,
    humidityPct: 43,
    visibilityKm: 9,
    windFromDeg: 270,
    windFromLabel: "O",
    windSpeedKmh: 18,
    gustKmh: 25,
    confidence: 76,
  },
  {
    id: "weather-quilicura",
    label: "Viento demo sector norte",
    latitude: -33.3667,
    longitude: -70.7333,
    sourceType: "sensor",
    sourceName: "Sensor meteorológico ARGUS simulado",
    observedAtLabel: "Actualización demo hace 7 min",
    temperatureC: 23,
    humidityPct: 39,
    visibilityKm: 8,
    windFromDeg: 225,
    windFromLabel: "SO",
    windSpeedKmh: 14,
    gustKmh: 21,
    confidence: 71,
  },
  {
    id: "weather-san-bernardo",
    label: "Viento demo zona sur",
    latitude: -33.5922,
    longitude: -70.6996,
    sourceType: "meteorological_center",
    sourceName: "Centro meteorológico demo",
    observedAtLabel: "Actualización demo hace 9 min",
    temperatureC: 21,
    humidityPct: 48,
    visibilityKm: 10,
    windFromDeg: 300,
    windFromLabel: "NO",
    windSpeedKmh: 11,
    gustKmh: 17,
    confidence: 68,
  },
];

export const demoHazardOrigins: HazardOrigin[] = [
  {
    id: "hazard-urban-fire-demo",
    title: "Incendio demo urbano",
    kind: "fire_smoke",
    latitude: -33.454,
    longitude: -70.684,
    severity: "high",
    sourceSummary: "Origen demo para validar una zona estimada de humo.",
  },
  {
    id: "hazard-gas-release-demo",
    title: "Posible liberación de gas demo",
    kind: "gas_leak",
    latitude: -33.382,
    longitude: -70.724,
    severity: "critical",
    sourceSummary: "Señal demo no confirmada para validar una proyección conservadora.",
  },
];

export const demoRiskProjections: RiskProjection[] = [
  createRiskProjection({
    id: "risk-smoke-east-demo",
    title: "Zona estimada de riesgo por humo",
    hazard: demoHazardOrigins[0],
    weather: demoWeatherObservations[0],
    radiusMeters: 4_200,
    spreadAngleDeg: 42,
    confidence: 72,
    explanation:
      "Estimación visual demo: con viento desde el oeste, el humo podría desplazarse aproximadamente hacia el este.",
    recommendedAction:
      "Evita la zona estimada, cierra ventanas cercanas y sigue instrucciones oficiales.",
  }),
  createRiskProjection({
    id: "risk-gas-northeast-demo",
    title: "Zona estimada de riesgo por posible gas",
    hazard: demoHazardOrigins[1],
    weather: demoWeatherObservations[1],
    radiusMeters: 3_000,
    spreadAngleDeg: 34,
    confidence: 64,
    explanation:
      "Estimación visual demo: el viento desde el suroeste proyecta el posible desplazamiento hacia el noreste.",
    recommendedAction:
      "Mantén distancia, evita desplazarte a favor del viento y espera indicaciones oficiales.",
  }),
];
