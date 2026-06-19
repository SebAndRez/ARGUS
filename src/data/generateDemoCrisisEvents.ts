import { enrichEventLifecycle } from "@/lib/alertLifecycle";
import type {
  AlertLifecycleStatus,
  CrisisEvent,
  EventSeverity,
  EventType,
  HelpPriority,
} from "@/types/crisis";

const DEMO_EVENT_COUNT = 420;
const BASE_TIMESTAMP = Date.UTC(2026, 5, 1, 18, 0, 0);

const zones = [
  { name: "Santiago Centro", latitude: -33.4489, longitude: -70.6693, spread: 0.018 },
  { name: "Maipú", latitude: -33.5104, longitude: -70.7562, spread: 0.024 },
  { name: "Puente Alto", latitude: -33.6117, longitude: -70.5758, spread: 0.025 },
  { name: "Las Condes", latitude: -33.4088, longitude: -70.5671, spread: 0.02 },
  { name: "Providencia", latitude: -33.4314, longitude: -70.6093, spread: 0.014 },
  { name: "La Florida", latitude: -33.5227, longitude: -70.5987, spread: 0.021 },
  { name: "San Bernardo", latitude: -33.5922, longitude: -70.6996, spread: 0.024 },
  { name: "Ñuñoa", latitude: -33.4569, longitude: -70.5979, spread: 0.014 },
  { name: "Estación Central", latitude: -33.4591, longitude: -70.699, spread: 0.015 },
  { name: "Recoleta", latitude: -33.4063, longitude: -70.6403, spread: 0.018 },
  { name: "Quilicura", latitude: -33.3667, longitude: -70.7333, spread: 0.024 },
  { name: "Pudahuel", latitude: -33.4372, longitude: -70.7658, spread: 0.025 },
  { name: "Peñalolén", latitude: -33.4862, longitude: -70.5358, spread: 0.02 },
  { name: "Independencia", latitude: -33.4154, longitude: -70.6472, spread: 0.014 },
  { name: "Cerrillos", latitude: -33.5022, longitude: -70.7164, spread: 0.018 },
] as const;

const incidentTemplates: Array<{
  category: string;
  title: string;
  description: string;
  type: EventType;
  baseSeverity: EventSeverity;
  action: string;
}> = [
  { category: "Accidente de tránsito", title: "Accidente de tránsito reportado", description: "Colisión o incidente vial pendiente de contraste.", type: "REPORT", baseSeverity: "MEDIUM", action: "Reduce la velocidad y usa una ruta alternativa." },
  { category: "Incendio menor", title: "Humo e incendio menor", description: "Se observa humo localizado sin confirmación institucional.", type: "REPORT", baseSeverity: "HIGH", action: "Evita el humo y mantén distancia del lugar." },
  { category: "Corte de luz", title: "Corte de suministro eléctrico", description: "Vecinos reportan interrupción eléctrica en el sector.", type: "REPORT", baseSeverity: "LOW", action: "Desconecta equipos sensibles y revisa información oficial." },
  { category: "Corte de agua", title: "Interrupción de agua potable", description: "Reporte ciudadano de baja presión o corte de agua.", type: "REPORT", baseSeverity: "LOW", action: "Reserva agua disponible y consulta al proveedor local." },
  { category: "Manifestación", title: "Concentración de personas", description: "Aglomeración o manifestación reportada en vía pública.", type: "ALERT", baseSeverity: "MEDIUM", action: "Evita la congestión y busca una ruta alternativa." },
  { category: "Robo reportado", title: "Robo reportado por vecinos", description: "Señal ciudadana pendiente de verificación adicional.", type: "REPORT", baseSeverity: "HIGH", action: "No intervengas y contacta a las autoridades si estás en riesgo." },
  { category: "Persona sospechosa", title: "Actividad sospechosa reportada", description: "Conducta inusual informada sin evidencia concluyente.", type: "REPORT", baseSeverity: "MEDIUM", action: "Mantén distancia y evita confrontaciones." },
  { category: "Emergencia médica", title: "Solicitud de apoyo médico", description: "Persona requiere asistencia médica en el sector.", type: "SOS", baseSeverity: "CRITICAL", action: "Despeja el acceso y no muevas a la persona salvo peligro inmediato." },
  { category: "Infraestructura dañada", title: "Daño en infraestructura urbana", description: "Daño visible en calzada, señalética o mobiliario.", type: "REPORT", baseSeverity: "MEDIUM", action: "Evita el punto dañado y reporta cambios relevantes." },
  { category: "Inundación", title: "Acumulación de agua en vía", description: "Aniego o inundación localizada reportada por residentes.", type: "ALERT", baseSeverity: "HIGH", action: "No cruces zonas inundadas y busca terreno más alto." },
  { category: "Obstrucción de ruta", title: "Ruta parcialmente obstruida", description: "Objeto, obra o incidente limita el tránsito.", type: "REPORT", baseSeverity: "MEDIUM", action: "Reduce la velocidad y sigue desvíos señalizados." },
  { category: "Vehículo abandonado", title: "Vehículo abandonado reportado", description: "Vehículo sin ocupantes genera preocupación vecinal.", type: "REPORT", baseSeverity: "LOW", action: "No manipules el vehículo y mantén una distancia prudente." },
  { category: "Humo visible", title: "Columna de humo visible", description: "Humo observado a distancia; origen aún no confirmado.", type: "ALERT", baseSeverity: "HIGH", action: "Cierra ventanas cercanas y evita desplazarte hacia el humo." },
  { category: "SOS", title: "Solicitud SOS ciudadana", description: "Solicitud de ayuda emitida desde ubicación aproximada.", type: "SOS", baseSeverity: "CRITICAL", action: "No te expongas; despeja el acceso para equipos de respuesta." },
];

const lifecycleStatuses: AlertLifecycleStatus[] = [
  "new",
  "verifying",
  "confirmed",
  "responding",
  "resolved",
  "expired",
  "dismissed",
];

const statusByLifecycle: Record<AlertLifecycleStatus, string> = {
  new: "NEW",
  verifying: "UNDER_REVIEW",
  confirmed: "VALIDATED",
  responding: "ESCALATED",
  resolved: "RESOLVED",
  expired: "NEW",
  dismissed: "DISCARDED",
};

const priorityBySeverity: Record<EventSeverity, HelpPriority> = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function choose<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function varySeverity(base: EventSeverity, random: () => number): EventSeverity {
  const levels: EventSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const baseIndex = levels.indexOf(base);
  const shift = random() < 0.16 ? 1 : random() < 0.22 ? -1 : 0;
  return levels[Math.max(0, Math.min(levels.length - 1, baseIndex + shift))];
}

export function generateDemoCrisisEvents(
  count = DEMO_EVENT_COUNT,
  seed = 20260619
): CrisisEvent[] {
  const random = createSeededRandom(seed);

  return Array.from({ length: count }, (_, index) => {
    const zone = choose(zones, random);
    const template = choose(incidentTemplates, random);
    const severity = varySeverity(template.baseSeverity, random);
    const lifecycleStatus = choose(lifecycleStatuses, random);
    const minutesAgo = Math.floor(random() * 60 * 72);
    const createdAt = new Date(BASE_TIMESTAMP - minutesAgo * 60_000);
    const verificationCount = Math.floor(random() * 18);
    const stillHappeningCount = Math.floor(random() * (verificationCount + 1));
    const notHappeningCount = Math.max(
      0,
      Math.min(verificationCount - stillHappeningCount, Math.floor(random() * 5))
    );
    const confidence = Math.round(
      Math.max(
        18,
        Math.min(
          96,
          38 + stillHappeningCount * 4 - notHappeningCount * 5 + random() * 24
        )
      )
    );
    const isExpired = lifecycleStatus === "expired";
    const lastVerifiedAt =
      verificationCount > 0
        ? new Date(createdAt.getTime() + Math.floor(random() * minutesAgo) * 60_000).toISOString()
        : null;
    const baseEvent: CrisisEvent = {
      id: `demo-crisis-${String(index + 1).padStart(4, "0")}`,
      title: `${template.title} · ${zone.name}`,
      category: template.category,
      description: `${template.description} Evento generado con seed fija para pruebas de escala visual.`,
      latitude: zone.latitude + (random() - 0.5) * zone.spread * 2,
      longitude: zone.longitude + (random() - 0.5) * zone.spread * 2,
      locationText: `${zone.name}, Región Metropolitana`,
      severity,
      priority: priorityBySeverity[severity],
      type: template.type,
      status: statusByLifecycle[lifecycleStatus],
      createdAt: createdAt.toISOString(),
      updatedAt: lastVerifiedAt ?? createdAt.toISOString(),
      lifecycleStatus,
      confidence,
      sourceCategory: "citizen_stream",
      sourceSummary: "Reporte ciudadano sintético para prueba de escala.",
      whyItMatters:
        severity === "CRITICAL"
          ? "Puede requerir respuesta inmediata y contraste con fuentes adicionales."
          : "Permite probar priorización, filtros y agrupación geoespacial.",
      recommendedAction: template.action,
      operatorRecommendedAction:
        "Contrastar la señal demo, revisar prioridad y mantener seguimiento geoespacial.",
      verificationCount,
      stillHappeningCount,
      notHappeningCount,
      falseReportCount: Math.floor(random() * 2),
      lastVerifiedAt,
      expiresAt: isExpired
        ? new Date(BASE_TIMESTAMP - Math.floor(random() * 240) * 60_000).toISOString()
        : new Date(BASE_TIMESTAMP + (60 + Math.floor(random() * 720)) * 60_000).toISOString(),
      isExpired,
      canReactivate: isExpired,
      restrictedMode: false,
      author: `Ciudadano demo ${String((index % 60) + 1).padStart(2, "0")}`,
      recordType: template.type === "SOS" ? "HelpRequest" : "Report",
      isDemo: true,
    };

    return enrichEventLifecycle(baseEvent);
  });
}

export const demoCrisisEvents = generateDemoCrisisEvents();
