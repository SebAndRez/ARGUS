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
