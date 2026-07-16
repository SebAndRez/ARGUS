import type { ArgusRoute } from "@/types/map";

export const demoRoutes: ArgusRoute[] = [
  {
    id: "route-terrestrial-santiago-demo",
    title: "Corredor terrestre urbano demo",
    type: "terrestrial",
    coordinates: [
      [-33.4568, -70.7005],
      [-33.4514, -70.6756],
      [-33.4385, -70.6501],
      [-33.4287, -70.6252],
    ],
    status: "Operativa demo",
    confidence: 82,
    description: "Ruta terrestre de referencia para logística y respuesta urbana.",
    isDemo: true,
  },
  {
    id: "route-air-santiago-demo",
    title: "Corredor aéreo de observación demo",
    type: "air",
    coordinates: [
      [-33.3929, -70.7858],
      [-33.4075, -70.7208],
      [-33.432, -70.666],
      [-33.461, -70.6105],
    ],
    status: "Planificada demo",
    confidence: 68,
    description: "Trayectoria visual aproximada; no representa tráfico aéreo real.",
    isDemo: true,
  },
  {
    id: "route-maritime-valparaiso-demo",
    title: "Ruta marítima de apoyo demo",
    type: "maritime",
    coordinates: [
      [-33.0105, -71.735],
      [-33.025, -71.682],
      [-33.041, -71.636],
      [-33.052, -71.602],
    ],
    status: "Referencia demo",
    confidence: 73,
    description: "Corredor marítimo ilustrativo cercano al puerto de Valparaíso.",
    isDemo: true,
  },
];
