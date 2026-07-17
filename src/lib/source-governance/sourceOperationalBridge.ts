/**
 * ARGUS — puente gobernanza ↔ operación real (Prompt 4 Fase I).
 *
 * Hallazgo: `src/lib/source-governance/sourceGovernanceRegistry.ts` decide
 * permisos (`canCreateIncident`, `requiresConfiguration`, ...) de forma
 * puramente declarativa — un valor escrito a mano por fuente, que puede
 * quedar desactualizado respecto a si esa fuente realmente tiene código
 * implementado, está desactivada, o le faltan credenciales hoy.
 * `ARGUS_SOURCE_OPERATIONS_REGISTRY` (`src/lib/vigia/sourceOperationsRegistry.ts`)
 * ya es la fuente de verdad real para esa pregunta ("¿esta fuente puede
 * ejecutarse de verdad?"), pero gobernanza nunca la consultaba — el mandato
 * exige explícitamente que "estas decisiones deben aplicarse en ejecución,
 * no solamente documentarse" (Prompt 4 Fase I).
 *
 * Este módulo NO fusiona los dos registros (harían falta migrar ~30
 * consumidores de gobernanza y ~43 filas del registro operacional, fuera de
 * alcance y de alto riesgo para una sola tarea) ni crea un tercer registro:
 * es un puente de solo lectura, puro y síncrono, entre los dos esquemas de
 * ID que ya existen (`usgs-earthquake` en gobernanza, `usgs_earthquake` en
 * operaciones) — ver `docs/architecture/ARGUS_SOURCE_CONSOLIDATION_IMPLEMENTATION.md`
 * §4 para el inventario completo de por qué ambos registros sobreviven por
 * separado.
 */

import {
  ARGUS_SOURCE_OPERATIONS_REGISTRY,
  isSourceConfigured,
  type ArgusSourceDefinition,
} from "@/lib/vigia/sourceOperationsRegistry";

/** Los dos esquemas de ID solo difieren en el separador para la inmensa mayoría de fuentes compartidas. */
function canonicalizeSourceId(id: string): string {
  return id.trim().toLowerCase().replace(/-/g, "_");
}

const OPERATIONS_BY_CANONICAL_ID = new Map<string, ArgusSourceDefinition>(
  ARGUS_SOURCE_OPERATIONS_REGISTRY.map((definition) => [canonicalizeSourceId(definition.id), definition])
);

/**
 * Resuelve la entrada del registro operacional real para un `sourceId` de
 * gobernanza (o cualquier variante hyphen/underscore) — `undefined` cuando
 * la fuente de gobernanza no tiene contraparte operacional conocida (p. ej.
 * `usgs-shakemap`/`smithsonian-gvp-activity`, sub-productos con política de
 * gobernanza propia pero sin fila dedicada en el registro operacional).
 */
export function resolveOperationsDefinition(governanceSourceId: string): ArgusSourceDefinition | undefined {
  return OPERATIONS_BY_CANONICAL_ID.get(canonicalizeSourceId(governanceSourceId));
}

export type OperationalAvailabilityVerdict = {
  available: boolean;
  reason: string;
};

/**
 * Verdicto síncrono y puro de disponibilidad real de capacidad (no de
 * ejecución en vivo — esa señal requiere `KnowledgeIngestionRun` vía
 * `deriveSourceOperationalStatus`, asíncrona, fuera de alcance de un router
 * de planificación síncrono). Cuando no hay contraparte operacional
 * conocida, se asume disponible (fail-open a nivel de capacidad — la
 * gobernanza sigue siendo quien decide permisos; este puente solo puede
 * negar, nunca conceder, un permiso que gobernanza no otorgó).
 */
export function checkOperationalAvailability(governanceSourceId: string): OperationalAvailabilityVerdict {
  const definition = resolveOperationsDefinition(governanceSourceId);
  if (!definition) {
    return {
      available: true,
      reason: "Sin contraparte en el registro operacional — se asume disponible a nivel de capacidad.",
    };
  }

  if (definition.adapterStatus === "stub") {
    return { available: false, reason: "Adaptador sin implementación real (stub) en el registro operacional." };
  }
  if (definition.adapterStatus === "broken") {
    return { available: false, reason: "Adaptador marcado como estructuralmente roto en el registro operacional." };
  }
  if (definition.executionMode === "disabled") {
    return { available: false, reason: "Fuente desactivada intencionalmente en el registro operacional." };
  }
  if (!isSourceConfigured(definition)) {
    return {
      available: false,
      reason: `Faltan variables de entorno requeridas: ${definition.requiredEnv.join(", ")}.`,
    };
  }

  return { available: true, reason: "Adaptador implementado y configurado en el registro operacional." };
}
