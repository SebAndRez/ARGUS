import type { ArgusHazardDomain } from "@/types/knowledgeIntake";

export type ExtractedKnowledgeEntities = {
  places: string[];
  dates: string[];
  organizations: string[];
  chemicals: string[];
  isotopes: string[];
  speedsKmh: number[];
  vehicleTypes: string[];
  infrastructure: string[];
  casualties: string[];
  units: string[];
  hectares: number[];
  magnitudes: number[];
  depthsKm: number[];
  waveHeightsM: number[];
  wind: string[];
  domains: ArgusHazardDomain[];
};

const domainHints: Array<[ArgusHazardDomain, RegExp]> = [
  ["road_accident", /choque|colision|vehiculo|crash|road|km\/h/i],
  ["wildfire", /incendio forestal|wildfire|foco termico|hectarea|humo/i],
  ["urban_fire", /incendio estructural|residencial|smoke|flashover/i],
  ["earthquake", /terremoto|sismo|earthquake|magnitud/i],
  ["tsunami", /tsunami|ola|shoa|coastal/i],
  ["chemical_accident", /quimic|chlorine|toxic|chemical|pluma/i],
  ["nuclear_radiological", /radiolog|radiation|isotope|Cs-137|I-131/i],
  ["flood", /inundacion|flood|lluvia|aneg/i],
  ["explosion", /explosion|blast|vapor cloud/i],
  ["building_collapse", /colapso|collapse|estructura/i],
];

function matches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).map((match) => match[0]);
}

export function extractKnowledgeEntities(text: string): ExtractedKnowledgeEntities {
  const safeText = text ?? "";
  return {
    places: matches(safeText, /\b(Santiago|Valparaiso|Concepcion|Talcahuano|Chile|Maule|Biobio|Araucania)\b/gi),
    dates: matches(safeText, /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g),
    organizations: matches(safeText, /\b(SENAPRED|CONAF|USGS|GDACS|NOAA|NIST|CSB|IAEA|WHO|NHTSA|NTSB)\b/g),
    chemicals: matches(safeText, /\b(chlorine|ammonia|benzene|cloro|amoniaco)\b/gi),
    isotopes: matches(safeText, /\b(Cs-137|I-131|Co-60|Sr-90)\b/g),
    speedsKmh: Array.from(safeText.matchAll(/(\d+(?:\.\d+)?)\s?km\/?h/gi)).map((match) => Number(match[1])),
    vehicleTypes: matches(safeText, /\b(bus|truck|camion|auto|vehiculo|ambulance)\b/gi),
    infrastructure: matches(safeText, /\b(bridge|puente|hospital|ruta|carretera|subestacion|planta|warehouse)\b/gi),
    casualties: matches(safeText, /\b(fatalities|injured|muertos|heridos|desplazados)\b/gi),
    units: matches(safeText, /\b(km\/h|ha|mSv|km|m)\b/gi),
    hectares: Array.from(safeText.matchAll(/(\d+(?:\.\d+)?)\s?(ha|hectareas)/gi)).map((match) => Number(match[1])),
    magnitudes: Array.from(safeText.matchAll(/M(?:w)?\s?(\d+(?:\.\d+)?)/gi)).map((match) => Number(match[1])),
    depthsKm: Array.from(safeText.matchAll(/(\d+(?:\.\d+)?)\s?km\s?(depth|profundidad)/gi)).map((match) => Number(match[1])),
    waveHeightsM: Array.from(safeText.matchAll(/(\d+(?:\.\d+)?)\s?m\s?(wave|ola)/gi)).map((match) => Number(match[1])),
    wind: matches(safeText, /\b(N|NE|E|SE|S|SW|W|NW)\b\s?\d{1,3}\s?km\/?h/gi),
    domains: domainHints.filter(([, pattern]) => pattern.test(safeText)).map(([domain]) => domain),
  };
}
