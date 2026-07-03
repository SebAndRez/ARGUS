import type {
  ArgusPredictionClassification,
  ArgusPredictionInput,
} from "@/types/predictiveCore";

const officialAuthorities = new Set(["official", "institutional"]);

function severityFromHint(hint?: string): ArgusPredictionClassification["baseSeverity"] {
  const normalized = hint?.toLowerCase() ?? "";
  if (["critical", "p0", "crítica", "critica"].some((token) => normalized.includes(token))) return "P0";
  if (["high", "p1", "alta"].some((token) => normalized.includes(token))) return "P1";
  if (["medium", "p2", "media"].some((token) => normalized.includes(token))) return "P2";
  if (["low", "p3", "baja"].some((token) => normalized.includes(token))) return "P3";
  return "P4";
}

function inferSeverity(input: ArgusPredictionInput) {
  const hinted = severityFromHint(input.severityHint);
  if (hinted !== "P4") return hinted;
  if (input.kind === "sos") return "P1";
  if (input.kind === "earthquake" || input.kind === "tsunami") return "P1";
  if (input.kind === "fire" || input.kind === "flood" || input.kind === "volcano") return "P2";
  if (input.kind === "system" || input.kind === "route" || input.kind === "camera") return "P4";
  return "P3";
}

function normalizedType(input: ArgusPredictionInput) {
  if (input.kind === "external_event" && input.sourceId) return input.sourceId;
  return input.kind;
}

export function classifyPredictionInput(
  input: ArgusPredictionInput
): ArgusPredictionClassification {
  const isOfficialPrimaryEvidence =
    officialAuthorities.has(input.sourceAuthority) ||
    (input.sourceAuthority === "open_data" &&
      ["earthquake", "tsunami", "weather", "flood", "volcano", "fire"].includes(input.kind));
  const isCitizen = input.sourceAuthority === "citizen" || input.kind === "citizen_report" || input.kind === "sos";
  const baseSeverity = inferSeverity(input);
  const reasons: string[] = [];

  if (isOfficialPrimaryEvidence) {
    reasons.push("La fuente se trata como evidencia primaria o dato abierto confiable.");
  }
  if (isCitizen) {
    reasons.push("El input ciudadano requiere confirmación independiente antes de elevar prioridad.");
  }
  if (input.latitude === undefined || input.longitude === undefined) {
    reasons.push("Faltan coordenadas, por lo que baja la confianza operativa.");
  }
  if (input.kind === "sos") {
    reasons.push("SOS mantiene prioridad alta y validación humana sin exponer datos personales.");
  }

  return {
    inputId: input.id,
    kind: input.kind,
    normalizedType: normalizedType(input),
    sourceAuthority: input.sourceAuthority,
    baseSeverity,
    scope: input.countryCode ? "NATIONAL" : input.latitude && input.longitude ? "LOCAL" : "GLOBAL",
    needsConfirmation: !isOfficialPrimaryEvidence,
    isOfficialPrimaryEvidence,
    confidenceSeed: isOfficialPrimaryEvidence ? 72 : isCitizen ? 38 : 52,
    reasons,
  };
}
