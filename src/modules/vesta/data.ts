import type {
  VestaChecklistCategory,
  VestaReminderType,
  VestaThreatGuide,
} from "@/modules/vesta/types";

export const VESTA_CATEGORY_LABELS: Record<VestaChecklistCategory, string> = {
  water_food: "Agua y alimentos",
  first_aid: "Botiquín",
  medications: "Medicamentos",
  documents: "Documentos",
  power_comms: "Energía y comunicación",
  hygiene: "Higiene",
  clothing: "Ropa y abrigo",
  pets: "Mascotas",
  babies_children: "Bebés/niños",
  elderly_dependents: "Adultos mayores/personas dependientes",
  tools: "Herramientas básicas",
  money_keys: "Dinero y llaves",
};

export const VESTA_CATEGORY_ORDER: VestaChecklistCategory[] = [
  "water_food",
  "first_aid",
  "medications",
  "documents",
  "power_comms",
  "hygiene",
  "clothing",
  "pets",
  "babies_children",
  "elderly_dependents",
  "tools",
  "money_keys",
];

/**
 * Items por defecto sembrados en el primer PreparednessProfile de cada
 * usuario. El usuario puede marcar "No aplica" (ej. sin mascotas) o agregar
 * items propios (isCustom: true) - ver POST /api/vesta/checklist.
 */
export const VESTA_DEFAULT_CHECKLIST_ITEMS: Record<VestaChecklistCategory, string[]> = {
  water_food: [
    "3 litros de agua por persona por día (mínimo 3 días)",
    "Alimentos no perecibles para 3 días",
    "Abrelatas manual",
  ],
  first_aid: [
    "Botiquín de primeros auxilios completo",
    "Guantes y mascarillas desechables",
    "Termómetro",
  ],
  medications: [
    "Medicamentos de uso habitual (mínimo 7 días)",
    "Lista de medicamentos y dosis por integrante",
    "Copia de recetas médicas",
  ],
  documents: [
    "Cédula de identidad (copia física o digital)",
    "Documentos de propiedad/seguros",
    "Contactos de emergencia impresos",
  ],
  power_comms: [
    "Linterna con pilas de repuesto",
    "Power bank cargado",
    "Radio a pilas o manivela",
  ],
  hygiene: [
    "Papel higiénico y toallas húmedas",
    "Jabón y artículos de aseo personal",
    "Bolsas de basura",
  ],
  clothing: [
    "Muda de ropa de abrigo por integrante",
    "Calzado cerrado resistente",
    "Manta o saco de dormir",
  ],
  pets: [
    "Alimento para mascotas (3 días)",
    "Correa, transportadora y documentos de vacunas",
  ],
  babies_children: [
    "Pañales y toallitas húmedas",
    "Leche/fórmula y elementos de alimentación",
    "Muda de ropa infantil",
  ],
  elderly_dependents: [
    "Insumos de movilidad o apoyo (bastón, silla, audífonos)",
    "Medicamentos e indicaciones médicas específicas",
  ],
  tools: [
    "Llave de paso de agua y gas a mano",
    "Herramienta multiuso",
    "Silbato de emergencia",
  ],
  money_keys: [
    "Efectivo en denominaciones pequeñas",
    "Copia de llaves de casa/auto",
  ],
};

export const VESTA_REMINDER_TEMPLATES: Array<{
  type: VestaReminderType;
  title: string;
  frequencyDays: number;
}> = [
  { type: "check_backpack", title: "Revisar mochila de emergencia", frequencyDays: 90 },
  { type: "change_water", title: "Cambiar agua almacenada", frequencyDays: 180 },
  { type: "check_food", title: "Revisar fechas de vencimiento de alimentos", frequencyDays: 90 },
  { type: "check_medications", title: "Revisar medicamentos y dosis", frequencyDays: 60 },
  { type: "charge_power_bank", title: "Cargar power bank y pilas", frequencyDays: 30 },
  { type: "update_documents", title: "Actualizar documentos y copias", frequencyDays: 180 },
  { type: "practice_family_drill", title: "Practicar simulacro familiar", frequencyDays: 180 },
];

/**
 * Guías por amenaza. Texto propio de ARGUS (no se copian textos extensos de
 * terceros); las organizaciones listadas en sourceReferences quedan
 * registradas como fuentes externas oficiales de referencia general
 * (SENAPRED, Ready.gov/FEMA, Cruz Roja), en línea con el mismo criterio de
 * fuente oficial que usa el registro de fuentes de ARGUS ARCA.
 */
export const VESTA_THREAT_GUIDES: VestaThreatGuide[] = [
  {
    threatType: "earthquake",
    title: "Terremoto",
    recommendations: [
      "Identifique zonas seguras dentro de su vivienda (bajo mesas firmes, lejos de vidrios).",
      "Agáchese, cúbrase y afírmese durante el movimiento; no salga corriendo mientras tiembla.",
      "Después del sismo, revise fugas de gas y daños estructurales antes de reingresar.",
      "Mantenga su mochila de emergencia accesible y calzado cerca de la cama.",
    ],
    sourceReferences: [
      { name: "SENAPRED", url: "https://www.senapred.cl", organization: "Servicio Nacional de Prevención y Respuesta ante Desastres (Chile)" },
      { name: "Ready.gov", url: "https://www.ready.gov/earthquakes", organization: "FEMA / Ready.gov" },
    ],
  },
  {
    threatType: "tsunami",
    title: "Tsunami",
    recommendations: [
      "Si siente un sismo fuerte cerca de la costa, evacúe de inmediato a zonas altas sin esperar alerta oficial.",
      "Conozca su ruta y punto de encuentro en altura antes de una emergencia.",
      "No regrese a la costa hasta que la autoridad confirme el fin de la alerta.",
    ],
    sourceReferences: [
      { name: "SENAPRED", url: "https://www.senapred.cl", organization: "Servicio Nacional de Prevención y Respuesta ante Desastres (Chile)" },
      { name: "Ready.gov", url: "https://www.ready.gov/tsunamis", organization: "FEMA / Ready.gov" },
    ],
  },
  {
    threatType: "wildfire",
    title: "Incendio forestal",
    recommendations: [
      "Mantenga un perímetro despejado de vegetación seca alrededor de la vivienda.",
      "Prepare su mochila y documentos con anticipación si vive en zona de interfaz forestal.",
      "Evacúe temprano ante indicación oficial; no espere ver el fuego para actuar.",
    ],
    sourceReferences: [
      { name: "SENAPRED", url: "https://www.senapred.cl", organization: "Servicio Nacional de Prevención y Respuesta ante Desastres (Chile)" },
      { name: "Cruz Roja", url: "https://www.redcross.org/get-help/how-to-prepare-for-emergencies/types-of-emergencies/wildfire.html", organization: "Cruz Roja / American Red Cross" },
    ],
  },
  {
    threatType: "flood",
    title: "Inundación",
    recommendations: [
      "Eleve objetos de valor y documentos en zonas propensas a inundación.",
      "Evite cruzar a pie o en vehículo zonas con agua en movimiento.",
      "Corte la electricidad si hay riesgo de ingreso de agua a la vivienda.",
    ],
    sourceReferences: [
      { name: "Ready.gov", url: "https://www.ready.gov/floods", organization: "FEMA / Ready.gov" },
      { name: "Cruz Roja", url: "https://www.redcross.org/get-help/how-to-prepare-for-emergencies/types-of-emergencies/flood.html", organization: "Cruz Roja / American Red Cross" },
    ],
  },
  {
    threatType: "power_outage",
    title: "Corte eléctrico",
    recommendations: [
      "Tenga linternas y power bank cargados; evite velas por riesgo de incendio.",
      "Desconecte equipos sensibles para evitar daños al restablecerse la energía.",
      "Revise que medicamentos que requieren refrigeración tengan un plan alternativo.",
    ],
    sourceReferences: [
      { name: "Ready.gov", url: "https://www.ready.gov/power-outages", organization: "FEMA / Ready.gov" },
    ],
  },
  {
    threatType: "medical_emergency",
    title: "Emergencia médica",
    recommendations: [
      "Mantenga a mano la lista de medicamentos, alergias y contacto de emergencia de cada integrante.",
      "Conozca la ubicación del punto médico o centro de salud más cercano.",
      "Considere compartir su ficha médica opcional en ARGUS AURA para agilizar la atención.",
    ],
    sourceReferences: [
      { name: "Cruz Roja", url: "https://www.redcross.org/take-a-class/first-aid", organization: "Cruz Roja / American Red Cross" },
    ],
  },
  {
    threatType: "general_evacuation",
    title: "Evacuación general",
    recommendations: [
      "Defina con su familia un punto de encuentro principal y uno alternativo.",
      "Practique la ruta de evacuación al menos una vez al año.",
      "Tenga su mochila de emergencia y documentos listos para salir en minutos.",
    ],
    sourceReferences: [
      { name: "SENAPRED", url: "https://www.senapred.cl", organization: "Servicio Nacional de Prevención y Respuesta ante Desastres (Chile)" },
      { name: "Ready.gov", url: "https://www.ready.gov/plan", organization: "FEMA / Ready.gov" },
    ],
  },
];

export function getVestaThreatGuide(threatType: string) {
  return VESTA_THREAT_GUIDES.find((guide) => guide.threatType === threatType) ?? null;
}
