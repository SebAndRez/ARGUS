import type { FenixScenario } from "@/modules/fenix/types";

export const fenixDemoScenarios: FenixScenario[] = [
  {
    id: "fenix-wildfire-demo",
    name: "Incendio forestal periurbano",
    description: "Escenario demo de evacuacion parcial con presion sobre rutas norte y refugios ARCA.",
    type: "wildfire",
    status: "completed",
    talosAssessmentId: "talos-demo-high",
    location: { lat: -33.41, lng: -70.61, label: "Borde periurbano demo", radiusMeters: 4200, isApproximate: true },
    assumptions: [
      { id: "a1", label: "Riesgo TALOS", value: "high", confidence: "high", sourceModule: "TALOS" },
      { id: "a2", label: "Ventana de evacuacion", value: 45, confidence: "medium", sourceModule: "MANUAL" },
    ],
    inputs: { talosRiskLevel: "high", estimatedPopulation: 4200, evacuationWindowMinutes: 45, weatherContext: "Viento moderado", mobilityConstraints: ["Ruta norte tensionada"], hermesRoutes: [{}], arcaShelters: [{}, {}], nexusResources: [{}], auraMedicalCapacity: [{}], oraculoEvidence: [{}], vigiaReports: [{}] },
    confidence: "medium",
    createdAt: "2026-07-05T09:00:00.000Z",
    updatedAt: "2026-07-05T13:15:00.000Z",
  },
  {
    id: "fenix-earthquake-demo",
    name: "Terremoto moderado urbano",
    description: "Escenario demo con demanda de refugios, rutas con precaucion y capacidad sanitaria limitada.",
    type: "earthquake",
    status: "requires_review",
    location: { lat: -33.45, lng: -70.66, label: "Centro urbano demo", radiusMeters: 2800, isApproximate: true },
    assumptions: [
      { id: "b1", label: "Poblacion expuesta", value: 8500, confidence: "low", sourceModule: "MANUAL", notes: "Estimacion agregada" },
    ],
    inputs: { talosRiskLevel: "medium", estimatedPopulation: 8500, evacuationWindowMinutes: 60, hermesRoutes: [{}], arcaShelters: [{}], auraMedicalCapacity: [{}] },
    confidence: "low",
    createdAt: "2026-07-05T08:20:00.000Z",
    updatedAt: "2026-07-05T11:45:00.000Z",
  },
  {
    id: "fenix-flood-demo",
    name: "Inundacion urbana",
    description: "Escenario demo para comparar rutas elevadas, refugios secos y brechas de agua potable.",
    type: "flood",
    status: "ready",
    location: { label: "Cuenca urbana demo", radiusMeters: 3600, isApproximate: true },
    assumptions: [
      { id: "c1", label: "Reportes VIGIA", value: 6, confidence: "medium", sourceModule: "VIGIA" },
    ],
    inputs: { talosRiskLevel: "high", estimatedPopulation: 3100, evacuationWindowMinutes: 50, vigiaReports: [{}, {}, {}], nexusResources: [{}] },
    confidence: "medium",
    createdAt: "2026-07-05T10:10:00.000Z",
    updatedAt: "2026-07-05T12:05:00.000Z",
  },
];
