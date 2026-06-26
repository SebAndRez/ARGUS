import type { CommandSourceHealth } from "@/types/incident";

export function getCommandSourceHealth(): CommandSourceHealth[] {
  return [
    {
      sourceId: "usgs_earthquake",
      name: "USGS",
      status: "UNKNOWN",
      freshnessLabel: "Disponible bajo demanda",
    },
    {
      sourceId: "gdacs",
      name: "GDACS",
      status: "UNKNOWN",
      freshnessLabel: "Disponible bajo demanda",
    },
    {
      sourceId: "noaa_tsunami",
      name: "NOAA Tsunami",
      status: "UNKNOWN",
      freshnessLabel: "Disponible bajo demanda",
    },
    {
      sourceId: "nasa_firms",
      name: "NASA FIRMS",
      status: process.env.NASA_FIRMS_MAP_KEY ? "ACTIVE" : "DISABLED",
      freshnessLabel: process.env.NASA_FIRMS_MAP_KEY
        ? "Configurado"
        : "Requiere MAP_KEY",
    },
    {
      sourceId: "met_norway",
      name: "MET Norway",
      status: "UNKNOWN",
      freshnessLabel: "Consulta por coordenada",
    },
    {
      sourceId: "citizen_reports",
      name: "Reportes ciudadanos",
      status: "ACTIVE",
      freshnessLabel: "Fuente interna",
    },
    {
      sourceId: "knowledge_base",
      name: "Knowledge Base",
      status: "ACTIVE",
      freshnessLabel: "Contexto local",
    },
  ];
}
