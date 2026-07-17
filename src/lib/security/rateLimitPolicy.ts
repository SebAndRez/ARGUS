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
  | "shelter_status_manual_update"
  | "vigia_manual_run"
  | "chile_alerts_manual_run"
  | "auth_login_ip"
  | "auth_login_account"
  | "auth_register_ip"
  | "mobile_safety_signal"
  | "sensor_safety_signal"
  | "quakesense_signal"
  | "public_incident_read"
  | "knowledge_intake_job_manual_run"
  | "codigo_azul_shelters_manual_run"
  | "routing_directions_public"
  | "incident_impact_read"
  | "territorial_dossier_read"
  | "operational_briefing_read";

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
  shelter_status_manual_update: {
    name: "shelter_status_manual_update",
    description: "Actualización manual de estado operacional de un refugio (operador)",
    windowSeconds: 600,
    maxRequests: 20,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Escribe CriticalPoiOperationalStatus/CriticalPoiStatusEvidence — sin dependencia de terceros, límite más alto que critical_pois_sync porque es la vía primaria de datos oficiales (no hay API pública SENAPRED/municipal confirmada), pero sigue acotado a operadores autenticados y fail-closed.",
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
  public_incident_read: {
    name: "public_incident_read",
    description: "Lectura pública/anónima de Report y HelpRequest redactados (PRIV-FINAL-001)",
    windowSeconds: 60,
    maxRequests: 60,
    keyStrategy: "ip",
    failureMode: "fail_open_local",
    notes:
      "Solo se aplica a llamadores sin sesión — nunca a OPERATOR/ANALYST/ADMIN/SUPER_ADMIN autenticados, que ya pasan por su propia sesión y necesitan refrescar el panel operativo sin fricción. Sirve para acotar enumeración/scraping del feed público redactado, no es la defensa de privacidad (esa es la redacción server-side); fail-open en memoria porque es una señal pública de emergencia y un bloqueo total ante falla del backend distribuido no debe poder ocultar un mapa de riesgo activo.",
  },
  knowledge_intake_job_manual_run: {
    name: "knowledge_intake_job_manual_run",
    description: "Ejecución manual de un job de ingesta de Knowledge Intake (operador)",
    windowSeconds: 900,
    maxRequests: 3,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Mismo perfil de costo/riesgo que vigia_manual_run/chile_alerts_manual_run: cada job golpea una API externa (con su propia cuota) y escribe KnowledgeIncident/KnowledgeEvidence/KnowledgeDocument. Se aplica de forma uniforme a los ~24 endpoints bajo /api/knowledge-intake/jobs/*, incluido run-all (que internamente puede disparar varias fuentes a la vez, por lo que el límite por operador es aún más relevante ahí que en un job individual).",
  },
  codigo_azul_shelters_manual_run: {
    name: "codigo_azul_shelters_manual_run",
    description: "Ejecución manual de la sincronización de albergues Código Azul (operador)",
    windowSeconds: 900,
    maxRequests: 3,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Mismo perfil que knowledge_intake_job_manual_run/chile_alerts_manual_run: recorre hasta ~9 páginas HTML del sitio oficial (recurso de terceros con su propio WAF) y escribe CriticalPoi/CriticalPoiOperationalStatus/CriticalPoiStatusEvidence — límite estricto porque cada corrida es costosa en tiempo y en cortesía hacia la fuente.",
  },
  routing_directions_public: {
    name: "routing_directions_public",
    description: "Proxy público de Google Directions (sin sesión requerida)",
    windowSeconds: 60,
    maxRequests: 30,
    keyStrategy: "ip",
    failureMode: "fail_open_local",
    notes:
      "Ruteo a pie/vehículo/evacuación debe seguir disponible para cualquier ciudadano sin cuenta — mismo criterio de disponibilidad que mobile_safety_signal/quakesense_signal (fail-open en memoria: un bloqueo total ante falla del backend distribuido no debe impedir obtener una ruta durante una emergencia real). Esto NO exime de costo: cada solicitud gasta cupo real de GOOGLE_DIRECTIONS_API_KEY, así que el límite por IP existe específicamente para acotar ese gasto, no solo abuso genérico.",
  },
  incident_impact_read: {
    name: "incident_impact_read",
    description: "Cálculo de análisis de impacto geoespacial de un incidente canónico (operador)",
    windowSeconds: 60,
    maxRequests: 30,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Cada solicitud ejecuta una consulta real a CriticalPoi (getCriticalInfrastructureNearIncident) — no es gratis, pero es una lectura, no una escritura, por lo que el límite es más alto que los jobs de sincronización/ingesta y fail-closed porque solo operadores autenticados lo alcanzan (sin el perfil de disponibilidad-ante-todo de las señales públicas de emergencia).",
  },
  territorial_dossier_read: {
    name: "territorial_dossier_read",
    description: "Cálculo del expediente territorial de un incidente canónico (operador)",
    windowSeconds: 60,
    maxRequests: 20,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Compone el análisis de impacto (que ya ejecuta una consulta CriticalPoi) más una consulta a refugios reales y una consulta de incidentes por región — más costoso que incident_impact_read por sí solo, de ahí el límite más bajo (20 vs 30 por minuto). Fail-closed y solo operadores, mismo criterio que incident_impact_read.",
  },
  operational_briefing_read: {
    name: "operational_briefing_read",
    description: "Composición del briefing operacional determinista de un incidente canónico (operador)",
    windowSeconds: 60,
    maxRequests: 15,
    keyStrategy: "user",
    failureMode: "fail_closed",
    notes:
      "Internamente compone impacto (Prompt 6) + expediente territorial (Prompt 7), cada uno con su propio costo ya acotado por sus propias políticas — este es el endpoint más costoso de los tres, de ahí el límite más bajo (15/min). No invoca ningún proveedor generativo (ninguno está habilitado en este pase), por lo que no hay coste de tokens que limitar todavía.",
  },
};

export function getRateLimitRule(name: RateLimitPolicyName): RateLimitRule {
  return rateLimitRules[name];
}
