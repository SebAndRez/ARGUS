import type { OraculoEvidence, OraculoScoringResult, OraculoSource } from "@/modules/oraculo/types";

const STALE_HOURS = 24;
const RECENT_HOURS = 2;

/**
 * Scoring base de confiabilidad. No es un juicio de "verdad absoluta": es
 * una explicación trazable de por qué una evidencia merece más o menos
 * confianza, según la fuente, su antigüedad, ubicación, atribución y
 * coincidencia con otra evidencia relacionada.
 */
export function calculateOraculoReliabilityScore(
  evidence: OraculoEvidence,
  source: OraculoSource | null,
  relatedEvidence: OraculoEvidence[] = []
): OraculoScoringResult {
  const reasons: string[] = [];
  const penalties: string[] = [];
  let score = 40;

  if (!source) {
    penalties.push("Fuente desconocida.");
    score -= 15;
  } else {
    if (source.sourceType === "official" || source.sourceType === "government") {
      score += 20;
      reasons.push("Fuente oficial.");
    } else if (source.sourceType === "international_organization") {
      score += 15;
      reasons.push("Fuente institucional.");
    } else if (source.sourceType === "citizen") {
      if (evidence.reliabilityScore === 0 && evidence.tags.length === 0) {
        penalties.push("Fuente ciudadana sin evidencia.");
        score -= 10;
      }
    }

    if (source.reliabilityTier === "tier_1_official" || source.reliabilityTier === "tier_2_institutional") {
      score += 10;
      reasons.push("Fuente con historial confiable.");
    }

    if (source.requiresLicenseReview) {
      penalties.push("Fuente marcada como requiere revisión.");
      score -= 5;
    }
  }

  const observedIso = evidence.observedAt ?? evidence.publishedAt ?? evidence.collectedAt;
  const ageHours = (Date.now() - new Date(observedIso).getTime()) / 3_600_000;
  if (Number.isFinite(ageHours)) {
    if (ageHours <= RECENT_HOURS) {
      score += 15;
      reasons.push("Evidencia reciente.");
    } else if (ageHours > STALE_HOURS) {
      penalties.push("Información antigua.");
      score -= 10;
    }
  } else {
    penalties.push("Datos incompletos (sin fecha confiable).");
    score -= 5;
  }

  if (evidence.location?.lat !== undefined && evidence.location?.lng !== undefined) {
    score += 10;
    reasons.push("Evidencia con ubicación.");
    if (evidence.location.isApproximate) {
      penalties.push("Ubicación aproximada.");
      score -= 3;
    }
  } else {
    penalties.push("Sin ubicación.");
    score -= 8;
  }

  if (evidence.attribution) {
    score += 5;
    reasons.push("Evidencia tiene atribución.");
  } else {
    penalties.push("Sin atribución.");
    score -= 5;
  }

  const matchingRelated = relatedEvidence.filter(
    (candidate) => candidate.id !== evidence.id && candidate.category === evidence.category
  );
  if (matchingRelated.length > 0) {
    score += Math.min(15, matchingRelated.length * 5);
    reasons.push(
      matchingRelated.length === 1
        ? "Coincide con otro reporte."
        : `Coincide con ${matchingRelated.length} reportes.`
    );
  }

  const officialMatch = matchingRelated.some((candidate) => candidate.sourceType === "official" || candidate.sourceType === "government");
  if (officialMatch && matchingRelated.length > 0) {
    score += 5;
    reasons.push("Una de las coincidencias es de fuente oficial.");
  }

  if (evidence.contradictionStatus === "confirmed") {
    penalties.push("Contradicción confirmada con fuente oficial.");
    score -= 20;
  } else if (evidence.contradictionStatus === "possible") {
    penalties.push("Contradicción posible detectada.");
    score -= 8;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const confidence =
    score >= 85 ? "verified" : score >= 65 ? "high" : score >= 40 ? "medium" : score >= 15 ? "low" : "unknown";

  const requiresHumanReview =
    confidence === "unknown" ||
    evidence.contradictionStatus === "confirmed" ||
    evidence.contradictionStatus === "requires_review" ||
    (source?.requiresLicenseReview ?? false);

  return { score, confidence, reasons, penalties, requiresHumanReview };
}
