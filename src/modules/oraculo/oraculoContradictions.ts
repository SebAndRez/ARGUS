import type { OraculoContradiction, OraculoEvidence } from "@/modules/oraculo/types";

const LOCATION_THRESHOLD_DEGREES = 0.15;
const TIME_THRESHOLD_MS = 2 * 60 * 60 * 1000;

function haveCoordinates(evidence: OraculoEvidence) {
  return typeof evidence.location?.lat === "number" && typeof evidence.location?.lng === "number";
}

function distanceDegrees(a: OraculoEvidence, b: OraculoEvidence) {
  if (!haveCoordinates(a) || !haveCoordinates(b)) return null;
  return Math.hypot((a.location!.lat! - b.location!.lat!), (a.location!.lng! - b.location!.lng!));
}

function eventTimestamp(evidence: OraculoEvidence) {
  const iso = evidence.observedAt ?? evidence.publishedAt ?? evidence.collectedAt;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Detección básica de contradicciones. ORÁCULO no intenta resolverlas
 * automáticamente: solo las señala, explica por qué importan y recomienda
 * revisión humana cuando corresponde.
 */
export function detectOraculoContradictions(evidenceList: OraculoEvidence[]): OraculoContradiction[] {
  const contradictions: OraculoContradiction[] = [];

  for (let i = 0; i < evidenceList.length; i += 1) {
    for (let j = i + 1; j < evidenceList.length; j += 1) {
      const a = evidenceList[i];
      const b = evidenceList[j];
      if (a.category !== b.category) continue;
      if (a.relatedEventId && b.relatedEventId && a.relatedEventId !== b.relatedEventId) continue;

      const distance = distanceDegrees(a, b);
      const isNearby = distance === null ? true : distance <= LOCATION_THRESHOLD_DEGREES;
      if (!isNearby) continue;

      const timeA = eventTimestamp(a);
      const timeB = eventTimestamp(b);
      const closeInTime =
        timeA !== null && timeB !== null ? Math.abs(timeA - timeB) <= TIME_THRESHOLD_MS * 6 : true;
      if (!closeInTime) continue;

      // Ubicaciones incompatibles: mismo evento/categoría pero muy lejos entre sí.
      if (distance !== null && distance > LOCATION_THRESHOLD_DEGREES * 4) {
        contradictions.push({
          id: `contradiction-loc-${a.id}-${b.id}`,
          evidenceIds: [a.id, b.id],
          type: "location_mismatch",
          severity: "medium",
          summary: `"${a.title}" y "${b.title}" reportan ubicaciones muy distintas para el mismo tipo de evento.`,
          recommendation: "Confirmar coordenadas exactas antes de fusionar ambos reportes.",
          requiresHumanReview: true,
        });
      }

      // Tiempos incompatibles: mismo evento pero separados por mucho tiempo.
      if (timeA !== null && timeB !== null && Math.abs(timeA - timeB) > TIME_THRESHOLD_MS * 12) {
        contradictions.push({
          id: `contradiction-time-${a.id}-${b.id}`,
          evidenceIds: [a.id, b.id],
          type: "time_mismatch",
          severity: "low",
          summary: `"${a.title}" y "${b.title}" tienen marcas de tiempo muy separadas para tratarse del mismo evento.`,
          recommendation: "Verificar si corresponden a eventos distintos antes de correlacionarlos.",
          requiresHumanReview: false,
        });
      }

      // Confirmado vs rechazado.
      const statuses = [a.verificationStatus, b.verificationStatus];
      if (statuses.includes("verified") && statuses.includes("rejected")) {
        contradictions.push({
          id: `contradiction-status-${a.id}-${b.id}`,
          evidenceIds: [a.id, b.id],
          type: "status_mismatch",
          severity: "high",
          summary: `Una fuente confirma el evento mientras otra lo descarta ("${a.title}" vs "${b.title}").`,
          recommendation: "Requiere revisión humana antes de escalar a ATLAS.",
          requiresHumanReview: true,
        });
      }

      // Reporte ciudadano contradice fuente oficial.
      const citizenVsOfficial =
        (a.sourceType === "citizen" && (b.sourceType === "official" || b.sourceType === "government")) ||
        (b.sourceType === "citizen" && (a.sourceType === "official" || a.sourceType === "government"));
      if (citizenVsOfficial && statuses.includes("rejected")) {
        contradictions.push({
          id: `contradiction-source-${a.id}-${b.id}`,
          evidenceIds: [a.id, b.id],
          type: "source_conflict",
          severity: "high",
          summary: "Un reporte ciudadano contradice a una fuente oficial.",
          recommendation: "Priorizar fuente oficial, pero no descartar el reporte ciudadano sin revisión.",
          requiresHumanReview: true,
        });
      }

      // Duplicado: misma categoría, misma zona, ventana de tiempo estrecha.
      if (
        distance !== null &&
        distance <= LOCATION_THRESHOLD_DEGREES / 3 &&
        timeA !== null &&
        timeB !== null &&
        Math.abs(timeA - timeB) <= TIME_THRESHOLD_MS
      ) {
        contradictions.push({
          id: `contradiction-dup-${a.id}-${b.id}`,
          evidenceIds: [a.id, b.id],
          type: "duplicate_conflict",
          severity: "low",
          summary: `"${a.title}" y "${b.title}" podrían ser el mismo evento reportado dos veces.`,
          recommendation: "Agrupar como duplicado si se confirma coincidencia.",
          requiresHumanReview: false,
        });
      }
    }
  }

  return contradictions;
}

export function evidenceHasOpenContradiction(evidenceId: string, contradictions: OraculoContradiction[]) {
  return contradictions.some(
    (contradiction) => contradiction.evidenceIds.includes(evidenceId) && contradiction.requiresHumanReview
  );
}
