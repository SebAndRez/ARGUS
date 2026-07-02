import { extractKnowledgeEntities } from "@/lib/knowledge-intake/entityExtractor";
import type {
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusLessonLearned,
} from "@/types/knowledgeIntake";

export function extractLessonsFromIncident(
  incident: Pick<ArgusIncidentKnowledge, "id" | "domain" | "sourceNames" | "summary" | "tags">
): ArgusLessonLearned[] {
  return [
    {
      id: `lesson-${incident.id}`,
      title: `Leccion operacional para ${incident.domain}`,
      domain: incident.domain,
      sourceIncidentId: incident.id,
      sourceName: incident.sourceNames[0] ?? "ARGUS Knowledge Intake",
      summary: incident.summary,
      whatFailed: ["Datos incompletos al inicio", "Necesidad de validacion cruzada"],
      whatWorked: ["Registro estructurado", "Separacion entre evidencia y recomendacion"],
      earlyWarningSignals: ["Reportes repetidos", "Interrupcion de movilidad", "Condiciones ambientales agravantes"],
      recommendedPreventiveActions: ["Preparar fuentes oficiales", "Mapear rutas y puntos criticos"],
      recommendedResponseActions: ["Verificar ubicacion", "Cruzar evidencia", "Escalar solo con validacion humana"],
      applicableToChile: incident.tags.includes("Chile") || incident.tags.includes("CL"),
      confidenceScore: 64,
      tags: incident.tags,
    },
  ];
}

export function extractLessonsFromText(text: string, domain: ArgusHazardDomain): ArgusLessonLearned[] {
  const entities = extractKnowledgeEntities(text);
  const stableId = text
    .slice(0, 32)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return [
    {
      id: `lesson-text-${domain}-${stableId || "empty"}`,
      title: `Leccion extraida de documento ${domain}`,
      domain,
      sourceIncidentId: "pending-normalization",
      sourceName: "Manual knowledge input",
      summary: text.slice(0, 240) || "Documento sin texto suficiente.",
      whatFailed: entities.infrastructure.length ? [`Infraestructura mencionada: ${entities.infrastructure.join(", ")}`] : [],
      whatWorked: entities.organizations.length ? [`Organizaciones mencionadas: ${entities.organizations.join(", ")}`] : [],
      earlyWarningSignals: entities.domains.map((item) => `Senal de dominio: ${item}`),
      recommendedPreventiveActions: ["Revisar aplicabilidad local", "Solicitar fuente primaria si falta"],
      recommendedResponseActions: ["Mantener recomendacion informativa hasta revision humana"],
      applicableToChile: /Chile|SENAPRED|CONAF|SHOA|SERNAGEOMIN/i.test(text),
      confidenceScore: text.length > 200 ? 58 : 35,
      tags: [domain, "manual_extraction"],
    },
  ];
}
