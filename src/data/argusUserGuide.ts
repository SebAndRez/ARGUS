export type GuideStatus =
  | "real"
  | "official"
  | "external"
  | "citizen"
  | "estimate"
  | "experimental"
  | "demo"
  | "runtime"
  | "future";

export interface GuideLayer {
  title: string;
  status: GuideStatus;
  body: string;
  cautions: string[];
}

export interface GuideScenario {
  title: string;
  lookAt: string[];
  report: string[];
  avoid: string[];
  practical: string;
  limit: string;
}

export interface ReportTypeGuide {
  title: string;
  useWhen: string;
  avoidWhen: string;
  include: string;
}

export const quickActions = [
  "Ver el mapa",
  "Revisar capas",
  "Reportar incidente",
  "Usar SOS",
  "Confirmar estado",
  "Consultar fuentes",
  "Validar informacion",
  "Prepararse mejor",
];

export const statusDescriptions: Record<GuideStatus, string> = {
  real: "Funcion conectada a datos reales o persistentes del sistema.",
  official: "Dato de una institucion reconocida. Siga siempre sus instrucciones.",
  external: "Fuente tecnica externa integrada en ARGUS, con cobertura y tiempos propios.",
  citizen: "Reporte enviado por una persona. Puede ser util, pero requiere validacion.",
  estimate: "Calculo ARGUS basado en senales, capas o fuentes. No es certeza.",
  experimental: "Funcion en prueba. No debe usarse como unica verdad operacional.",
  demo: "Dato o flujo preparado para probar la experiencia.",
  runtime: "Dato temporal que puede desaparecer al reiniciar servidor o sesion.",
  future: "Capacidad disenada para una version posterior.",
};

export const guideLayers: GuideLayer[] = [
  {
    title: "Eventos reales y fuentes externas",
    status: "external",
    body: "Incluye fuentes integradas como USGS, GDACS, NOAA, MET Norway o NASA FIRMS si estan configuradas.",
    cautions: [
      "Cada fuente puede tener retrasos, cobertura limitada o requerir confirmacion local.",
      "Una fuente externa no reemplaza a organismos nacionales o autoridades locales.",
    ],
  },
  {
    title: "Reportes ciudadanos",
    status: "citizen",
    body: "Informacion enviada por usuarios para mostrar problemas locales como humo, cortes, derrumbes, personas heridas o necesidad de ayuda.",
    cautions: [
      "No asuma que un reporte es verdadero hasta que se valide.",
      "No publique datos personales o medicos sensibles en reportes abiertos.",
    ],
  },
  {
    title: "SOS y solicitudes de ayuda",
    status: "real",
    body: "Senales de emergencia generadas por usuarios. Deben priorizarse visualmente y nunca bloquearse por reputacion.",
    cautions: [
      "No equivale automaticamente a despacho oficial de emergencia.",
      "Si tiene senal telefonica, contacte tambien al numero local de emergencia.",
    ],
  },
  {
    title: "Safety Checks",
    status: "runtime",
    body: "Estados como estoy bien, necesito ayuda, pendiente o no responde. Ayudan a reducir incertidumbre familiar y comunitaria.",
    cautions: [
      "En esta fase pueden ser demo/runtime.",
      "No reemplazan una llamada directa a servicios de emergencia.",
    ],
  },
  {
    title: "Sacudida ciudadana / QuakeSense",
    status: "experimental",
    body: "Estimaciones ARGUS de posible sacudida a partir de senales compatibles.",
    cautions: [
      "No es alerta sismica oficial.",
      "Debe confirmarse con fuentes oficiales como organismos sismologicos y autoridades.",
    ],
  },
  {
    title: "Riesgo visual, clima y rutas",
    status: "estimate",
    body: "Capas para orientar lectura del terreno, viento, zonas estimadas y rutas demostrativas.",
    cautions: [
      "Una ruta no es 100% segura.",
      "Las zonas estimadas no son poligonos oficiales de evacuacion.",
    ],
  },
  {
    title: "Zonas de conflicto o crisis",
    status: "demo",
    body: "Capas curadas o demo para contextualizar incidentes y concentraciones de riesgo.",
    cautions: [
      "Ayudan a entender contexto, no certifican seguridad.",
      "Evite exponerse para grabar o confirmar informacion.",
    ],
  },
  {
    title: "Fenix Twin",
    status: "demo",
    body: "Modulo de simulacion y orientacion de evacuacion. Puede apoyar analisis futuro para instituciones.",
    cautions: [
      "No ordena evacuaciones.",
      "Confirme rutas y refugios con autoridad local.",
    ],
  },
  {
    title: "AURA Medic Mesh",
    status: "future",
    body: "Base para apoyo medico: boton medico, datos opcionales, contacto de emergencia y puntos medicos cercanos.",
    cautions: [
      "La parte profesional de triage, camas, ambulancias y mando sanitario es futura.",
      "No entregue datos medicos sensibles en reportes publicos.",
    ],
  },
];

export const reportTypes: ReportTypeGuide[] = [
  {
    title: "Emergencia / SOS",
    useWhen: "Hay riesgo vital, atrapamiento, lesion grave, amenaza directa o una persona no puede pedir ayuda por otra via.",
    avoidWhen: "Quiere probar la app, hacer una broma o informar algo no urgente.",
    include: "Ubicacion, condicion general, numero aproximado de personas afectadas y peligro inmediato.",
  },
  {
    title: "Incendio, humo o foco termico",
    useWhen: "Ve humo, fuego, avance de incendio o una ruta bloqueada por emergencia.",
    avoidWhen: "Solo vio informacion no confirmada en redes sin poder describir lugar y hora.",
    include: "Direccion del humo si la conoce, accesos cortados, viviendas amenazadas y personas heridas.",
  },
  {
    title: "Terremoto percibido o danos",
    useWhen: "Percibe sacudida, ve derrumbes, cortes, grietas, personas heridas o infraestructura danada.",
    avoidWhen: "Solo quiere confirmar magnitud oficial. Use fuentes oficiales para eso.",
    include: "Tipo de dano, hora aproximada, ubicacion y si hay riesgo costero.",
  },
  {
    title: "Inundacion, aluvion o tormenta",
    useWhen: "Hay agua en movimiento, viviendas afectadas, puentes danados, arboles caidos o rutas cortadas.",
    avoidWhen: "El evento no esta cerca y no tiene informacion directa.",
    include: "Nivel aproximado, direccion del flujo, puntos cortados y personas aisladas.",
  },
  {
    title: "Accidente, persona herida o necesidad medica",
    useWhen: "Hay lesion, accidente, falta de atencion medica, persona inmovil o necesidad urgente.",
    avoidWhen: "Quiere compartir datos medicos privados de otra persona sin necesidad.",
    include: "Condicion general, ubicacion, acceso seguro y si ya se contacto emergencia local.",
  },
  {
    title: "Ruta cortada, derrumbe o punto peligroso",
    useWhen: "Identifica bloqueo, puente danado, caida de rocas, congestion critica o salida cerrada.",
    avoidWhen: "No puede ubicar el punto con claridad.",
    include: "Sentido afectado, punto de referencia, alternativa visible y hora del hallazgo.",
  },
  {
    title: "Refugio, punto medico o ayuda disponible",
    useWhen: "Conoce un punto seguro, agua, alimento, atencion basica o refugio disponible.",
    avoidWhen: "No sabe si el lugar esta abierto o autorizado.",
    include: "Capacidad aproximada, horario, contacto publico si existe y restricciones.",
  },
];

export const scenarios: GuideScenario[] = [
  {
    title: "Terremoto",
    lookAt: ["Fuentes sismicas", "reportes cercanos", "Safety Check", "rutas y cortes"],
    report: ["danos", "derrumbes", "personas heridas", "cortes de comunicacion", "rutas bloqueadas"],
    avoid: ["esperar la app si hay peligro inmediato", "tratar QuakeSense como alerta oficial"],
    practical: "Protejase primero. Luego revise ARGUS solo si es seguro y siga informacion oficial.",
    limit: "QuakeSense es experimental y no reemplaza organismos oficiales.",
  },
  {
    title: "Tsunami o zona costera",
    lookAt: ["NOAA/SHOA si esta disponible", "rutas", "refugios", "reportes de costa"],
    report: ["rutas cortadas", "personas atrapadas", "refugios saturados", "zonas inundadas"],
    avoid: ["esperar confirmacion de la app si hay senales naturales claras", "usar rutas no confirmadas"],
    practical: "Si el sismo fue fuerte o dificulto mantenerse en pie, evacue a zona alta segun instrucciones locales.",
    limit: "ARGUS puede orientar, pero no garantiza seguridad de ruta ni reemplaza orden oficial.",
  },
  {
    title: "Incendio forestal o urbano",
    lookAt: ["clima y viento", "NASA FIRMS si esta configurado", "reportes de humo", "rutas"],
    report: ["humo", "fuego", "personas heridas", "rutas cortadas", "necesidad de evacuacion"],
    avoid: ["acercarse a grabar", "bloquear accesos de emergencia", "difundir rumores"],
    practical: "Priorice evacuar si las autoridades lo indican y reporte solo desde un lugar seguro.",
    limit: "Un foco termico satelital no siempre equivale a incendio confirmado.",
  },
  {
    title: "Inundacion o aluvion",
    lookAt: ["zonas afectadas", "rutas", "reportes cercanos", "clima"],
    report: ["calles cortadas", "puentes danados", "viviendas afectadas", "personas aisladas"],
    avoid: ["cruzar agua en movimiento", "entrar a zonas inestables"],
    practical: "Use Safety Check y marque puntos seguros solo si esta confirmado y es seguro hacerlo.",
    limit: "ARGUS no mide profundidad real ni estabilidad estructural.",
  },
  {
    title: "Tormenta severa o clima extremo",
    lookAt: ["MET Norway si cargo", "riesgo visual", "rutas", "reportes de dano"],
    report: ["arboles caidos", "cortes electricos", "anegamientos", "voladuras"],
    avoid: ["rutas expuestas", "zonas con cables caidos", "publicar datos no confirmados"],
    practical: "Ahorre bateria y consulte fuentes meteorologicas oficiales.",
    limit: "La capa de riesgo visual es estimada y no reemplaza pronosticos oficiales.",
  },
  {
    title: "Emergencia medica",
    lookAt: ["SOS", "AURA si esta disponible", "puntos medicos", "ubicacion actual"],
    report: ["condicion general", "ubicacion", "riesgo inmediato", "acceso al lugar"],
    avoid: ["publicar diagnosticos o datos medicos sensibles", "esperar a ARGUS si puede llamar emergencia"],
    practical: "Use SOS si hay riesgo vital y contacte servicios medicos locales si tiene senal.",
    limit: "ARGUS no diagnostica ni reemplaza atencion medica profesional.",
  },
  {
    title: "Persona perdida o aislada",
    lookAt: ["ubicacion", "rutas", "Safety Check", "SOS"],
    report: ["ultima ubicacion segura", "condicion", "accesos", "necesidad de ayuda"],
    avoid: ["desplazarse sin orientacion en zona peligrosa", "agotar bateria con cargas pesadas"],
    practical: "Con internet satelital o enlace remoto puede mantener reportes aun sin red movil.",
    limit: "ARGUS depende de energia, dispositivo funcional y conectividad.",
  },
  {
    title: "Corte de comunicaciones",
    lookAt: ["capturas previas", "mapas guardados si existen", "estado de conexion"],
    report: ["cuando vuelva la conexion", "cortes", "puntos seguros", "necesidades basicas"],
    avoid: ["depender solo de la app", "subir archivos pesados con mala senal"],
    practical: "Mantenga radio, linterna, powerbank, contactos y plan B.",
    limit: "Si no hay internet ni energia, ARGUS puede no actualizar.",
  },
  {
    title: "Crisis de seguridad, conflicto o disturbios",
    lookAt: ["zonas marcadas", "reportes cercanos", "rutas alternativas", "fuentes oficiales"],
    report: ["solo si es seguro", "bloqueos", "puntos peligrosos", "necesidad de ayuda"],
    avoid: ["exponerse por grabar", "difundir rumores", "entrar en zonas de concentracion"],
    practical: "Priorice alejarse y siga instrucciones de autoridades locales.",
    limit: "Las zonas de contexto no certifican seguridad.",
  },
  {
    title: "Evacuacion o evento masivo",
    lookAt: ["rutas", "refugios", "puntos medicos", "concentracion de incidentes"],
    report: ["salidas bloqueadas", "aglomeraciones peligrosas", "lesionados", "rutas cortadas"],
    avoid: ["saturar SOS con reportes menores", "separarse sin punto de encuentro"],
    practical: "Use Safety Check al llegar a zona segura y confirme rutas con autoridad.",
    limit: "ARGUS no garantiza disponibilidad de refugios o accesos.",
  },
];

export const glossary = [
  ["Capa", "Vista de informacion sobre el mapa."],
  ["Reporte", "Senal enviada por una persona para informar algo que ocurre."],
  ["SOS", "Solicitud urgente de ayuda. No debe usarse para pruebas fuera de demo."],
  ["Safety Check", "Estado breve para indicar si una persona esta bien o necesita ayuda."],
  ["Fuente oficial", "Institucion publica o tecnica reconocida."],
  ["Fuente externa", "Servicio global o API integrada, como USGS, GDACS, NOAA, MET Norway o NASA FIRMS."],
  ["Estimacion ARGUS", "Calculo o lectura derivada; no es certeza oficial."],
  ["Validacion", "Proceso para reducir rumores, duplicados e informacion debil."],
  ["Reputacion", "Indicador de confiabilidad historica; no bloquea SOS."],
  ["Runtime", "Dato temporal que puede perderse al reiniciar."],
  ["Demo", "Dato o flujo usado para probar y mostrar funcionamiento."],
  ["Experimental", "Funcion en prueba que requiere confirmacion externa."],
  ["Verificado", "Dato revisado o confirmado segun reglas disponibles."],
];

export const faq = [
  ["ARGUS reemplaza a emergencias?", "No. ARGUS apoya informacion y coordinacion. En emergencia real contacte tambien a los servicios oficiales si tiene senal."],
  ["Puedo usar ARGUS sin internet?", "Puede ver informacion ya cargada o capturas, pero la app necesita conectividad para actualizar datos y enviar reportes."],
  ["Que pasa si hago un reporte falso?", "Puede bajar la confianza de la cuenta y activar revision o sanciones. SOS no debe usarse para bromas."],
  ["Reporte ciudadano y fuente oficial son lo mismo?", "No. El reporte ciudadano es preliminar; la fuente oficial proviene de una institucion reconocida."],
  ["Que significa experimental?", "Que la funcion esta en prueba y no debe usarse como unica base para decidir."],
  ["Que hago si veo una alerta cerca?", "Lea el detalle, revise fuente, nivel de confianza y siga instrucciones oficiales. No se exponga para confirmar."],
  ["Estoy en costa despues de un terremoto fuerte, que hago?", "Siga senales naturales e instrucciones locales. No espere a ARGUS si debe evacuar a zona alta."],
  ["ARGUS comparte mis datos?", "Debe compartir solo lo necesario segun modulo y permisos. Los datos sensibles requieren controles de privacidad antes de produccion."],
  ["Puedo usar ARGUS con Starlink?", "Si hay energia, dispositivo funcional e internet, una conexion satelital puede ayudar a mantener mapas, reportes y Safety Checks."],
  ["Por que algunos datos no estan confirmados?", "Porque pueden venir de reportes preliminares, fuentes con retraso o estimaciones ARGUS pendientes de validacion."],
];
