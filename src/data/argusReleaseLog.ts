export type ArgusReleaseEntry = {
  version: string;
  date: string;
  title: string;
  summary: string;
  affectedModules: string[];
  changes: string[];
  simple: string;
};

// Fuente unica de versiones oficiales de ARGUS. Se actualiza exclusivamente
// mediante `npm run release:prepare` (scripts/prepare-release.mjs).
// No editar manualmente ni reordenar: la entrada en el indice 0 es la
// version oficial mas reciente y se usa como base para calcular la siguiente.
export const argusReleaseLog: ArgusReleaseEntry[] = [
  {
    "version": "ARGUS V1.0.1.1",
    "date": "2026-07-05",
    "title": "Restore realtime layers and harden ARGUS security",
    "summary": "Se restauraron capas en tiempo real del mapa operativo y se reforzaron controles de seguridad internos de ARGUS.",
    "affectedModules": [
      "Mapa operativo",
      "Capas en tiempo real",
      "Reportes ciudadanos",
      "Acceso y sesion",
      "Seguridad ARGUS"
    ],
    "changes": [
      "Se restauro la visualizacion de capas operativas en tiempo real.",
      "Se reforzaron validaciones internas relacionadas con acceso y sesion.",
      "Se mejoro la consistencia de reportes ciudadanos dentro del mapa.",
      "Se ajustaron componentes visuales asociados al mapa operativo.",
      "Se fortalecio la trazabilidad de cambios criticos para ARGUS."
    ],
    "simple": "Esta actualizacion recupera capas criticas del mapa, mejora la estabilidad operativa y deja el sistema mas seguro para futuras versiones."
  },
  {
    "version": "ARGUS V1.0.1.0",
    "date": "2026-07-05",
    "title": "Base oficial de versionado de ARGUS",
    "summary": "Se establece ARGUS V1.0.1.0 como version base del nuevo sistema de versionado oficial y correlativo de ARGUS.",
    "affectedModules": [
      "Actualizaciones publicas"
    ],
    "changes": [
      "Se define la version oficial base a partir de la cual se numeran los proximos releases."
    ],
    "simple": "A partir de esta version, cada actualizacion de ARGUS tiene un numero de version oficial y ordenado, en vez de mostrar mensajes internos de commits."
  }
];
