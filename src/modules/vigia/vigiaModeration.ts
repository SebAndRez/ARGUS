import type { VigiaReport } from "@/modules/vigia/types";

const PHONE_PATTERN = /\b(\+?\d[\d\s-]{6,}\d)\b/;
const ADDRESS_HINT_PATTERN = /\b(calle|avenida|av\.|pasaje|depto\.?|departamento)\s+\S+\s*#?\s*\d+/i;
const ID_DOC_PATTERN = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/;
const VIOLENT_LANGUAGE_PATTERN = /\b(matar|golpear|linchar|quemar[la]{0,2}\s+viv[oa])\b/i;
const SPAM_PATTERN = /(https?:\/\/\S+){2,}|(.)\1{6,}/i;

/**
 * Reglas base de moderación para reportes públicos. No es un motor de NLP:
 * son heurísticas simples de primera línea para marcar contenido que
 * requiere revisión humana antes de mostrarse ampliamente.
 */
export function flagPotentiallySensitiveReport(report: VigiaReport): string[] {
  const flags: string[] = [];
  const text = `${report.title}\n${report.description}`;

  if (!report.description || report.description.trim().length === 0) {
    flags.push("empty_description");
  }
  if (SPAM_PATTERN.test(text)) {
    flags.push("possible_spam");
  }
  if (PHONE_PATTERN.test(text)) {
    flags.push("contains_phone_number");
  }
  if (ADDRESS_HINT_PATTERN.test(text)) {
    flags.push("contains_exact_address");
  }
  if (ID_DOC_PATTERN.test(text)) {
    flags.push("contains_identity_document");
  }
  if (VIOLENT_LANGUAGE_PATTERN.test(text)) {
    flags.push("violent_language");
  }
  if (report.type === "missing_person_context" && !report.location.isApproximate) {
    flags.push("missing_person_needs_approximate_location");
  }

  return flags;
}

export const vigiaModerationFlagLabel: Record<string, string> = {
  empty_description: "Descripción vacía",
  possible_spam: "Posible spam",
  contains_phone_number: "Contiene teléfono",
  contains_exact_address: "Contiene dirección exacta",
  contains_identity_document: "Contiene documento de identidad",
  violent_language: "Lenguaje que incita violencia",
  missing_person_needs_approximate_location: "Requiere ubicación aproximada (persona)",
};
