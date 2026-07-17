/**
 * Contenido estatico de conectividad de emergencia (ARGUS v1.0.3.6 §8/§9/§10):
 * instrucciones Android/iPhone, advertencias y numeros de emergencia. Vive
 * como datos versionados (no JSX embebido) para que
 * `connectivityOfflineCache.ts` pueda cachearlo junto al ultimo estado
 * conocido y detectar cuando el contenido cacheado quedo desactualizado
 * respecto a una nueva version publicada.
 */

export const TELECOM_GUIDANCE_VERSION = "1.0.3.6-1";

/**
 * Generico a proposito (spec §8: "no codificar una unica ruta como valida
 * para todos los modelos") — los nombres de menu varian por fabricante y
 * version de Android.
 */
export const ANDROID_INSTRUCTIONS: string[] = [
  "Abrir Ajustes.",
  "Entrar en Conexiones, Red e Internet o Redes móviles (el nombre varía según fabricante y versión).",
  "Seleccionar la SIM correspondiente si el equipo tiene más de una.",
  "Activar selección automática de operador.",
  "Activar roaming de datos únicamente cuando la autoridad u operador lo indique para la emergencia.",
  "Esperar a que el equipo busque red automáticamente.",
  "Si la conexión no se actualiza, reiniciar el modo avión o reiniciar el equipo.",
];

export const IPHONE_INSTRUCTIONS: string[] = [
  "Abrir Configuración.",
  "Entrar en Red celular o Datos celulares.",
  "Seleccionar la línea correspondiente si el equipo tiene más de una SIM.",
  "Entrar en Selección de red y mantener Automática activada.",
  "Entrar en Opciones de datos celulares.",
  "Activar roaming de datos únicamente cuando la autoridad u operador lo indique para la emergencia.",
  "Si la red no se actualiza, reiniciar el modo avión.",
];

export const MANUFACTURER_VARIANCE_DISCLAIMER =
  "Los nombres exactos de los menús pueden variar según el fabricante, modelo y versión del sistema operativo. Estos pasos son una referencia general.";

/** Spec §10 — advertencias operacionales obligatorias, ninguna promesa absoluta. */
export const WARNINGS: string[] = [
  "El roaming no crea señal donde ninguna compañía tiene cobertura.",
  "La conexión depende de que otra red esté operativa en la zona.",
  "La activación puede limitarse a zonas específicas informadas por la autoridad.",
  "No todos los servicios pueden funcionar con igual calidad.",
  "Las llamadas, SMS y datos pueden degradarse por congestión.",
  "El estado puede cambiar rápidamente — confirme siempre la vigencia del dato.",
  "Privilegie el envío de SMS y mensajería liviana sobre llamadas y video.",
  "Evite video llamadas y descargas pesadas mientras la red esté degradada.",
  "Mantenga batería suficiente para comunicaciones esenciales.",
  "Confirme siempre esta información con SUBTEL, SENAPRED o su operador.",
];

export const EMERGENCY_NUMBERS: Array<{ label: string; number: string }> = [
  { label: "Carabineros", number: "133" },
  { label: "Bomberos", number: "132" },
  { label: "Ambulancia (SAMU)", number: "131" },
  { label: "SENAPRED", number: "137" },
];
