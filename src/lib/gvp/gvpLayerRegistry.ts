export type GvpLayerType = "holocene_volcanoes" | "pleistocene_volcanoes" | "holocene_eruptions";

export type GvpLayerDefinition = {
  id: GvpLayerType;
  label: string;
  layerType: GvpLayerType;
  typeNameCandidates: string[];
  outputFormat: "application/json";
  csvFallbackFormat: "csv";
  defaultEnabled: boolean;
  maxFeatures: number;
  caveats: string[];
};

export const GVP_DEFAULT_WFS_BASE =
  "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows";

export const GVP_ATTRIBUTION = "Smithsonian Institution Global Volcanism Program";
export const GVP_CITATION = "Smithsonian Institution Global Volcanism Program, Volcanoes of the World database.";
export const GVP_OPERATIONAL_CAVEAT =
  "GVP provides global volcanism catalog/context and preliminary reports; verify local observatory/authority for operational decisions.";

export const gvpLayerRegistry: Record<GvpLayerType, GvpLayerDefinition> = {
  holocene_volcanoes: {
    id: "holocene_volcanoes",
    label: "Holocene Volcanoes",
    layerType: "holocene_volcanoes",
    typeNameCandidates: [
      "GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes",
      "GVP-VOTW:E3WebApp_HoloceneVolcanoes",
      "GVP-VOTW:Holocene_Volcanoes",
      "GVP_VOTW:Holocene_Volcanoes",
      "Holocene_Volcanoes",
      "gvp:Holocene_Volcanoes",
    ],
    outputFormat: "application/json",
    csvFallbackFormat: "csv",
    defaultEnabled: true,
    maxFeatures: 500,
    caveats: ["Catalog context only; not a live local alert source.", GVP_OPERATIONAL_CAVEAT],
  },
  pleistocene_volcanoes: {
    id: "pleistocene_volcanoes",
    label: "Pleistocene Volcanoes",
    layerType: "pleistocene_volcanoes",
    typeNameCandidates: [
      "GVP-VOTW:Smithsonian_VOTW_Pleistocene_Volcanoes",
      "GVP-VOTW:Pleistocene_Volcanoes",
      "GVP_VOTW:Pleistocene_Volcanoes",
      "Pleistocene_Volcanoes",
      "gvp:Pleistocene_Volcanoes",
    ],
    outputFormat: "application/json",
    csvFallbackFormat: "csv",
    defaultEnabled: false,
    maxFeatures: 500,
    caveats: ["Optional contextual catalog layer; availability can vary by WFS publication.", GVP_OPERATIONAL_CAVEAT],
  },
  holocene_eruptions: {
    id: "holocene_eruptions",
    label: "Holocene Eruptions",
    layerType: "holocene_eruptions",
    typeNameCandidates: [
      "GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions",
      "GVP-VOTW:Holocene_Eruptions",
      "GVP_VOTW:Holocene_Eruptions",
      "Holocene_Eruptions",
      "gvp:Holocene_Eruptions",
    ],
    outputFormat: "application/json",
    csvFallbackFormat: "csv",
    defaultEnabled: true,
    maxFeatures: 500,
    caveats: ["Historical eruption memory only; not an incident generator.", GVP_OPERATIONAL_CAVEAT],
  },
};

export const gvpMapLayers = [
  {
    id: "smithsonian-gvp-volcanoes",
    name: "Smithsonian GVP Volcanoes",
    sourceId: "smithsonian-gvp",
    layerType: "volcano_baseline",
    isIncidentLayer: false,
    isKnowledgeLayer: true,
    defaultVisible: false,
    requiresConfiguration: false,
    attributionRequired: true,
    sublayers: ["Holocene Volcanoes", "Pleistocene Volcanoes", "High-Impact Historical Volcanoes"],
  },
  {
    id: "smithsonian-gvp-eruption-history",
    name: "Smithsonian GVP Eruption History",
    sourceId: "smithsonian-gvp",
    layerType: "eruption_history",
    isIncidentLayer: false,
    isHistoricalLayer: true,
    defaultVisible: false,
    sublayers: ["Historical Eruptions", "VEI History", "Tsunami-associated Eruptions if data exists"],
  },
  {
    id: "smithsonian-usgs-volcanic-activity-reports",
    name: "Smithsonian / USGS Volcanic Activity Reports",
    sourceId: "smithsonian-gvp",
    layerType: "volcanic_activity_report",
    isIncidentLayer: "guarded_reports_only",
    defaultVisible: false,
    preliminaryCaveat: true,
    sublayers: ["Current / Recent Activity Reports", "New Unrest", "New Eruptive Activity", "Continuing Eruptive Activity", "Continuing Unrest"],
  },
] as const;

export function getGvpLayerDefinition(layer: GvpLayerType) {
  return gvpLayerRegistry[layer];
}
