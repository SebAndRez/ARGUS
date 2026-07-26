import type { ExternalResourceKind, ImpactArea, OperationalResourceCandidate } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 10 (arquitectura extensible para
 * recursos que no tienen fuente propia hoy: MOP, DGA, municipios, telecom,
 * electricidad, agua, combustible, aeródromos, puertos, SAR, PDI, FFAA,
 * delegaciones, NBQ/radiológico).
 *
 * Interfaz preparada, ninguna API implementada todavía (mandato explícito:
 * "No implementar todavía las APIs. Preparar interfaces"). `implemented:
 * false` + `fetch` ausente es la señal — `operationalResourceEngine.ts` solo
 * llama `fetch` cuando `implemented === true`; en cualquier otro caso emite
 * un candidato "sin proveedor configurado" en vez de omitir la categoría en
 * silencio.
 *
 * Agregar un proveedor real más adelante = escribir su `fetch` e implementar
 * `implemented: true` en la fila correspondiente — cero cambios en el motor.
 */
export interface OperationalResourceProvider {
  kind: ExternalResourceKind;
  label: string;
  implemented: boolean;
  fetch?: (area: ImpactArea) => Promise<OperationalResourceCandidate[]>;
}

export const EXTERNAL_RESOURCE_PROVIDER_REGISTRY: OperationalResourceProvider[] = [
  { kind: "mop_infrastructure", label: "MOP — Infraestructura vial/hídrica", implemented: false },
  { kind: "dga_water_authority", label: "DGA — Dirección General de Aguas", implemented: false },
  { kind: "municipality", label: "Municipalidad", implemented: false },
  { kind: "telecom_provider", label: "Proveedor de telecomunicaciones", implemented: false },
  { kind: "electricity_provider", label: "Distribuidora eléctrica", implemented: false },
  { kind: "water_utility", label: "Empresa sanitaria (agua potable)", implemented: false },
  { kind: "fuel_station", label: "Estación de combustible", implemented: false },
  { kind: "airport", label: "Aeródromo", implemented: false },
  { kind: "seaport", label: "Puerto", implemented: false },
  { kind: "helipad", label: "Helipuerto", implemented: false },
  { kind: "sar_team", label: "Equipo SAR (búsqueda y rescate)", implemented: false },
  { kind: "pdi_station", label: "Cuartel PDI", implemented: false },
  { kind: "armed_forces_base", label: "Unidad Fuerzas Armadas", implemented: false },
  { kind: "delegation", label: "Delegación presidencial/provincial", implemented: false },
  { kind: "nbq_decontamination_center", label: "Centro de descontaminación NBQ", implemented: false },
  { kind: "radiological_monitoring_station", label: "Estación de medición radiológica", implemented: false },
];

export function getExternalResourceProvider(kind: ExternalResourceKind): OperationalResourceProvider | undefined {
  return EXTERNAL_RESOURCE_PROVIDER_REGISTRY.find((provider) => provider.kind === kind);
}
