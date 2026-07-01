import type { ProductStatusDefinition, ProductStatusKind } from "@/types/productStatus";

export const productStatusDefinitions: Record<ProductStatusKind, ProductStatusDefinition> = {
  REAL: {
    kind: "REAL",
    label: "Real",
    description: "Dato operativo persistente o conectado a backend real.",
    tone: "emerald",
  },
  OFFICIAL_SOURCE: {
    kind: "OFFICIAL_SOURCE",
    label: "Fuente oficial",
    description: "Fuente institucional externa. ARGUS no la reemplaza.",
    tone: "cyan",
  },
  EXTERNAL_VERIFIED: {
    kind: "EXTERNAL_VERIFIED",
    label: "Externo verificado",
    description: "Dato de fuente externa con validacion tecnica.",
    tone: "emerald",
  },
  CITIZEN_REPORT: {
    kind: "CITIZEN_REPORT",
    label: "Ciudadano",
    description: "Reporte ciudadano pendiente de evidencia o confirmacion.",
    tone: "amber",
  },
  ARGUS_ESTIMATE: {
    kind: "ARGUS_ESTIMATE",
    label: "Estimacion ARGUS",
    description: "Analisis o proyeccion de ARGUS, no confirmacion oficial.",
    tone: "orange",
  },
  EXPERIMENTAL: {
    kind: "EXPERIMENTAL",
    label: "Experimental",
    description: "Funcion en prueba. Puede tener falsos positivos o limites.",
    tone: "violet",
  },
  DEMO: {
    kind: "DEMO",
    label: "Demo",
    description: "Dato de prueba, no persistente ni oficial.",
    tone: "slate",
  },
  RUNTIME_ONLY: {
    kind: "RUNTIME_ONLY",
    label: "Runtime",
    description: "Existe solo en memoria de ejecucion, sin persistencia durable.",
    tone: "amber",
  },
  FUTURE: {
    kind: "FUTURE",
    label: "Futuro",
    description: "Arquitectura prevista, no activa todavia.",
    tone: "slate",
  },
  DISABLED: {
    kind: "DISABLED",
    label: "Deshabilitado",
    description: "Capa o fuente no activa.",
    tone: "red",
  },
};

export function getProductStatusDefinition(kind: ProductStatusKind) {
  return productStatusDefinitions[kind];
}
