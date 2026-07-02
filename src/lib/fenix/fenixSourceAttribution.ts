import type { FenixSimulationInput } from "@/types/fenixSimulation";
import type {
  ArgusDataQuality,
  ArgusSourceAttribution,
} from "@/types/sourceAttribution";

export function buildFenixSourceAttributions(
  input: FenixSimulationInput
): ArgusSourceAttribution[] {
  const sources: ArgusSourceAttribution[] = [
    {
      id: "argus-fenix-demo-scenarios",
      name: "ARGUS Fenix scenario library",
      category: "simulation",
      reliability: "argus_demo",
      isOfficial: false,
      usedFor: "Base scenario, affected-zone projection and demo route pressure.",
      note: "Synthetic operational preview. It is not an official disaster feed.",
    },
    {
      id: "argus-demo-settlements",
      name: "ARGUS demo settlements",
      category: "open-data-placeholder",
      reliability: "estimated",
      isOfficial: false,
      usedFor: "Nearby settlement context and population exposure estimate.",
      note: "Approximate context until census/open-data connectors are approved.",
    },
  ];

  if (input.sources.citizenReports) {
    sources.push({
      id: "argus-citizen-reports-aggregate",
      name: "ARGUS citizen reports aggregate",
      category: "citizen-signal",
      reliability: "user_aggregate",
      isOfficial: false,
      usedFor: "Report-density signal only.",
      note: "Aggregated count; no individual user identity is exposed.",
    });
  }

  if (input.sources.officialOrOpenRoutes) {
    sources.push({
      id: "argus-route-registry-demo",
      name: "ARGUS route registry demo",
      category: "routes",
      reliability: "argus_demo",
      isOfficial: false,
      usedFor: "Route impact preview and route review suggestions.",
      note: "Route status must be verified with competent authority before action.",
    });
  }

  if (input.sources.weather) {
    sources.push({
      id: "argus-weather-context",
      name: "ARGUS weather/risk context",
      category: "weather-risk",
      reliability: "estimated",
      isOfficial: false,
      usedFor: "Risk direction and uncertainty explanation.",
      note: "No scientific plume or tsunami propagation model is applied here.",
    });
  }

  return sources;
}

export function buildFenixDataQuality(
  input: FenixSimulationInput,
  sourceCount: number
): ArgusDataQuality {
  const uncertaintyPenalty =
    input.uncertainty === "high" ? 22 : input.uncertainty === "medium" ? 10 : 0;
  const sourceBonus = Math.min(16, sourceCount * 3);
  const score = Math.max(30, Math.min(82, 56 + sourceBonus - uncertaintyPenalty));
  const level = score >= 72 ? "high" : score >= 52 ? "medium" : "low";

  return {
    level,
    score,
    label:
      level === "high"
        ? "Contexto demo enriquecido"
        : level === "medium"
          ? "Contexto preliminar verificable"
          : "Contexto limitado",
    limitations: [
      "La simulacion no confirma hechos por si sola.",
      "Las rutas, refugios y poblacion son datos demo hasta conectar fuentes oficiales.",
      "Toda accion institucional requiere revision humana y autoridad competente.",
    ],
  };
}
