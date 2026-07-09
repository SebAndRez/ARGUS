import type { ChileOfficialAlertRaw } from "@/lib/sources/chile/senapredProvider";

/**
 * QA/demo fixtures — shaped exactly like `ChileOfficialAlertRaw` (the same
 * shape `senapredProvider.ts` produces from a live fetch) so they run
 * through the real classifier -> promotion -> persistence -> map ->
 * notifications pipeline, not a shortcut. Only used when `/api/chile-alerts/run`
 * is called with `?seed=true` — never mixed into production output silently.
 */
const NOW = new Date().toISOString();

export const chileAlertsSeed: ChileOfficialAlertRaw[] = [
  {
    title: "Alerta Roja por tornado y tromba marina en la Región de La Araucanía",
    region: "La Araucanía",
    threatText:
      "Se confirma la formación de un tornado y trombas marinas asociadas a un sistema convectivo severo sobre la Región de La Araucanía. Riesgo alto para estructuras livianas, embarcaciones menores y desplazamientos en zonas costeras e interiores.",
    levelText: "Alerta Roja",
    issuedAt: NOW,
    updatedAt: NOW,
    sourceId: "senapred_eventos",
    evidenceUrl: "https://www.senapred.cl/eventos/",
    contenido:
      "De acuerdo con la información proporcionada por la Dirección Meteorológica de Chile (DMC), se confirma la ocurrencia de un tornado con trombas marinas asociadas en la Región de La Araucanía. SENAPRED declara Alerta Roja y solicita extremar precauciones.",
  },
  {
    title: "Alerta Roja por viento severo en Villarrica, Región de La Araucanía",
    region: "La Araucanía",
    province: "Cautín",
    commune: "Villarrica",
    threatText: "Viento fuerte con ráfagas severas y riesgo de caída de estructuras y árboles en la comuna de Villarrica.",
    levelText: "Alerta Roja",
    issuedAt: NOW,
    updatedAt: NOW,
    sourceId: "senapred_eventos",
    evidenceUrl: "https://www.senapred.cl/eventos/",
    contenido:
      "Conforme al Informe de Riesgo Meteorológico de la Dirección Meteorológica de Chile (DMC), se registran rachas de viento severo en la comuna de Villarrica. SENAPRED mantiene Alerta Roja Comunal.",
  },
  {
    title: "Alerta Roja por viento severo en Pucón, Región de La Araucanía",
    region: "La Araucanía",
    province: "Cautín",
    commune: "Pucón",
    threatText: "Viento fuerte con ráfagas severas y riesgo de caída de estructuras y árboles en la comuna de Pucón.",
    levelText: "Alerta Roja",
    issuedAt: NOW,
    updatedAt: NOW,
    sourceId: "senapred_eventos",
    evidenceUrl: "https://www.senapred.cl/eventos/",
    contenido:
      "Conforme al Informe de Riesgo Meteorológico de la Dirección Meteorológica de Chile (DMC), se registran rachas de viento severo en la comuna de Pucón. SENAPRED mantiene Alerta Roja Comunal.",
  },
  {
    title: "Alerta Roja por viento severo en Freire, Región de La Araucanía",
    region: "La Araucanía",
    province: "Cautín",
    commune: "Freire",
    threatText: "Viento fuerte con ráfagas severas y riesgo de caída de estructuras y árboles en la comuna de Freire.",
    levelText: "Alerta Roja",
    issuedAt: NOW,
    updatedAt: NOW,
    sourceId: "senapred_eventos",
    evidenceUrl: "https://www.senapred.cl/eventos/",
    contenido:
      "Conforme al Informe de Riesgo Meteorológico de la Dirección Meteorológica de Chile (DMC), se registran rachas de viento severo en la comuna de Freire. SENAPRED mantiene Alerta Roja Comunal.",
  },
  {
    title: "Alerta Amarilla por tormentas eléctricas en la Región de Los Ríos",
    region: "Los Ríos",
    threatText: "Probables tormentas eléctricas en el litoral y cordillera de la costa de la Región de Los Ríos.",
    levelText: "Alerta Amarilla",
    issuedAt: NOW,
    updatedAt: NOW,
    sourceId: "senapred_eventos",
    evidenceUrl: "https://www.senapred.cl/eventos/",
    contenido:
      "De acuerdo con la información proporcionada por la Dirección Meteorológica de Chile (DMC), se pronostican tormentas eléctricas para la Región de Los Ríos. SENAPRED declara Alerta Amarilla Regional.",
  },
];
