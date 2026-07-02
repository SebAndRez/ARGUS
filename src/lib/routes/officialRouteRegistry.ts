import type {
  OfficialRoute,
  OfficialRouteDomain,
  OfficialRouteMetadata,
  OfficialRouteSourceType,
  OfficialRouteStatus,
} from "@/types/officialRoutes";

export const officialRouteCandidates: OfficialRoute[] = [
  {
    id: "cl-terrestrial-official-pending",
    domain: "TERRESTRIAL",
    name: "Chile terrestre - fuente oficial pendiente",
    countryCode: "CL",
    sourceName: "MOP / MTT / municipalidades / datos abiertos por validar",
    sourceType: "TRANSPORT_AUTHORITY",
    status: "NEEDS_SOURCE",
    isDemo: false,
    notes: "No hay integración oficial activa en ARGUS. Requiere convenio o dataset verificable.",
  },
  {
    id: "cl-maritime-official-pending",
    domain: "MARITIME",
    name: "Chile marítimo - fuente oficial pendiente",
    countryCode: "CL",
    sourceName: "DIRECTEMAR / SHOA por validar",
    sourceType: "MARITIME_AUTHORITY",
    status: "NEEDS_SOURCE",
    isDemo: false,
    notes: "No asumir rutas marítimas oficiales sin fuente pública verificable o convenio.",
  },
  {
    id: "cl-aerial-official-pending",
    domain: "AERIAL",
    name: "Chile aéreo - fuente oficial pendiente",
    countryCode: "CL",
    sourceName: "DGAC / AIP por validar",
    sourceType: "AVIATION_AUTHORITY",
    status: "NEEDS_SOURCE",
    isDemo: false,
    notes: "No asumir corredores aéreos oficiales sin publicación autorizada.",
  },
  {
    id: "global-osm-terrestrial-open-data",
    domain: "TERRESTRIAL",
    name: "Global terrestre - OpenStreetMap",
    countryCode: "GLOBAL",
    sourceName: "OpenStreetMap",
    sourceUrl: "https://www.openstreetmap.org",
    sourceType: "OPEN_DATA",
    status: "NEEDS_REVIEW",
    isDemo: false,
    notes: "OpenStreetMap es dato abierto comunitario, no fuente oficial gubernamental.",
  },
];

export function getRouteSourceLabel(metadata: OfficialRouteMetadata) {
  if (metadata.officialStatus === "OFFICIAL_ACTIVE") return "Ruta oficial";
  if (metadata.sourceType === "OPEN_DATA") return "Ruta basada en datos abiertos";
  if (metadata.isDemo) return "Ruta demo / ilustrativa";
  return "Fuente oficial pendiente";
}

export function buildRouteMetadata(input: {
  sourceType?: OfficialRouteSourceType;
  officialStatus?: OfficialRouteStatus;
  isDemo?: boolean;
}): OfficialRouteMetadata {
  const metadata: OfficialRouteMetadata = {
    sourceType: input.sourceType ?? "DEMO",
    officialStatus: input.officialStatus ?? "DEMO_ONLY",
    isDemo: input.isDemo ?? true,
    disclaimer: "",
  };
  metadata.disclaimer =
    metadata.officialStatus === "OFFICIAL_ACTIVE"
      ? "Ruta oficial integrada desde fuente verificable."
      : metadata.sourceType === "OPEN_DATA"
        ? "Ruta basada en datos abiertos; verificar con autoridad antes de operación crítica."
        : metadata.isDemo
          ? "Ruta demo / ilustrativa. No usar como instrucción oficial de evacuación."
          : "Fuente oficial pendiente; ARGUS no confirma disponibilidad operacional.";
  return metadata;
}

export function getOfficialRouteCandidates(domain?: OfficialRouteDomain) {
  if (!domain) return officialRouteCandidates;
  return officialRouteCandidates.filter((route) => route.domain === domain);
}

