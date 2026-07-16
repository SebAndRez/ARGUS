/**
 * ARGUS — tabla única de políticas de rate limiting (Prompt 12 §5).
 *
 * Antes de esta tarea este archivo solo contenía "buckets" conceptuales
 * (`public_api`, `sos_exception`, ...) sin relación 1:1 con ningún endpoint
 * real y sin un solo consumidor en todo el repo (confirmado por grep antes
 * de tocar el archivo). Se reemplaza por una tabla de políticas nombradas,
 * una por endpoint/clase de endpoint, que es la ÚNICA fuente de verdad para
 * `route class / limit / window / failure mode / key strategy` — el helper
 * central (`src/lib/security/rateLimit.ts`) y todos los endpoints leen de
 * aquí, nunca declaran su propio límite inline.
 */

/**
 * Cómo se construye la identidad usada como parte de la clave del contador.
 * Rutas de mayor riesgo (login) aplican DOS políticas independientes en la
 * misma solicitud — una `"ip"` y una `"account"` — combinando dos llamadas
 * al helper central en vez de una sola estrategia híbrida (Prompt 12 §13):
 * evita que una sola IP ataque múltiples cuentas y que una cuenta sea
 * atacada desde múltiples IPs, cada capa con su propia ventana/límite.
 */
export type RateLimitKeyStrategy =
  /** route + userId de sesión — para endpoints de operador ya autenticados. */
  | "user"
  /** route + IP normalizada — para endpoints públicos/anónimos. */
  | "ip"
  /** route + hash(identificador normalizado, p.ej. email) — nunca en texto plano. */
  | "account";

/**
 * - `fail_closed`: si el backend distribuido es requerido en producción y no
 *   está disponible (o falla), la operación se rechaza (503) — nunca se
 *   ejecuta sin protección. Para operaciones costosas/administrativas.
 * - `fail_open_local`: si no hay backend distribuido, se degrada a un
 *   contador en memoria por proceso (documentado como no autoritativo, nunca
 *   como protección global) en vez de bloquear por completo — para señales
 *   públicas donde un bloqueo total podría descartar una emergencia real.
 */
export type RateLimitFailureMode = "fail_closed" | "fail_open_local";

export type RateLimitPolicyName =
  | "knowledge_import_manual"
  | "knowledge_import_file"
  | "critical_pois_sync"
  | "vigia_manual_run"
  | "chile_alerts_manual_run"
  | "auth_login_ip"
  | "auth_login_account"
  | "auth_register_ip"
  | "mobile_safety_signal"
  | "sensor_safety_signal"
  | "quakesense_signal";

export interface RateLimitRule {
  name: RateLimitPolicyName;
  /** Human-readable, safe to log (no PII). */
  description: string;
  windowSeconds: number;
  maxRequests: number;
  keyStrategy: RateLimitKeyStrategy;
  failureMode: RateLimitFailureMode;
  notes: string;
}

/**
 * Cifras justificadas por endpoint (Prompt 12 §12) — no una cifra idéntica
 * para todos. Ajustables sin tocar la forma del contrato ni los call sites.
 */
export const rateLimitRules: Record<RateLimitPolicyName, RateLimitRule> = {
  knowledge_import_manual: {
    name: "knowledge_import_manual",
    description: "Carga manual de texto a la base de conocimiento (operador)",
    windowSeconds: 600,
    maxRequests: 10,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Escribe KnowledgeDocument/KnowledgeIncident/KnowledgeEvidence y corre extracción de entidades/lecciones — costoso, solo operadores autenticados.",
  },
  knowledge_import_file: {
    name: "knowledge_import_file",
    description: "Carga/preview de archivo a la base de conocimiento (operador)",
    windowSeconds: 600,
    maxRequests: 5,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Mismo costo que import manual más parsing de archivo — límite más bajo porque el payload esperado es mayor.",
  },
  critical_pois_sync: {
    name: "critical_pois_sync",
    description: "Sincronización de infraestructura crítica vía Overpass",
    windowSeconds: 900,
    maxRequests: 3,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Cada llamada golpea Overpass (recurso de terceros con su propia cuota) y escribe CriticalPoi — el límite más estricto de los endpoints administrativos.",
  },
  vigia_manual_run: {
    name: "vigia_manual_run",
    description: "Ejecución manual de ARGUS Global Watch",
    windowSeconds: 900,
    maxRequests: 3,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Consulta todas las fuentes globales activas y persiste incidentes — ya corre automáticamente cada 15 min vía cron; la ejecución manual es para operadores, no debe convertirse en una segunda vía de polling.",
  },
  chile_alerts_manual_run: {
    name: "chile_alerts_manual_run",
    description: "Ejecución manual del pipeline de alertas oficiales de Chile",
    windowSeconds: 900,
    maxRequests: 3,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes: "Mismo perfil de costo/riesgo que vigia_manual_run.",
  },
  auth_login_ip: {
    name: "auth_login_ip",
    description: "Intentos de login por IP",
    windowSeconds: 600,
    maxRequests: 10,
    keyStrategy: "ip",
    failureMode: "fail_closed",
    notes:
      "Login implica lectura de usuario + verificación de password hash (costo intencional). Sin límite por IP, fuerza bruta contra múltiples cuentas desde un mismo origen no tiene fricción.",
  },
  auth_login_account: {
    name: "auth_login_account",
    description: "Intentos de login por cuenta (email normalizado, hasheado)",
    windowSeconds: 600,
    maxRequests: 5,
    keyStrategy: "account",
    failureMode: "fail_closed",
    notes:
      "Capa independiente del límite por IP (auth_login_ip) — evaluada por separado en el mismo request, ambas deben permitir el intento. Evita fuerza bruta distribuida (múltiples IPs) contra una sola cuenta. Nunca se usa el email en texto plano como parte de la clave (ver clientIdentity.ts, hashIdentifier).",
  },
  auth_register_ip: {
    name: "auth_register_ip",
    description: "Registros de cuenta por IP",
    windowSeconds: 3600,
    maxRequests: 5,
    keyStrategy: "ip",
    failureMode: "fail_closed",
    notes: "Evita creación masiva de cuentas; el registro ya es costoso (validación de documento, hash de password, escritura).",
  },
  mobile_safety_signal: {
    name: "mobile_safety_signal",
    description: "Señales/eventos móviles de seguridad personal (placeholders en memoria)",
    windowSeconds: 60,
    maxRequests: 60,
    keyStrategy: "ip",
    failureMode: "fail_open_local",
    notes:
      "Endpoints todavía in-memory/placeholder (mobile-safety/*, mobile/*) pero representan superficie de abuso pública real. Nunca se bloquean por completo ante falla del backend — podrían transportar una señal de emergencia real — se degrada a un contador local documentado como no autoritativo.",
  },
  sensor_safety_signal: {
    name: "sensor_safety_signal",
    description: "Detecciones/check-ins de sensores (placeholders en memoria)",
    windowSeconds: 60,
    maxRequests: 120,
    keyStrategy: "ip",
    failureMode: "fail_open_local",
    notes: "Mismo criterio que mobile_safety_signal; límite más alto por el volumen esperado de sensores (aceleración, frenado, etc.).",
  },
  quakesense_signal: {
    name: "quakesense_signal",
    description: "Señales ciudadanas de QuakeSense (memoria, demo)",
    windowSeconds: 60,
    maxRequests: 60,
    keyStrategy: "ip",
    failureMode: "fail_open_local",
    notes: "Mismo criterio que mobile_safety_signal.",
  },
};

export function getRateLimitRule(name: RateLimitPolicyName): RateLimitRule {
  return rateLimitRules[name];
}
