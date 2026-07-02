export function getDocumentLabel(countryCode?: string | null) {
  return countryCode?.toUpperCase() === "CL" ? "RUT" : "Documento nacional / ID";
}

export function getDocumentPlaceholder(countryCode?: string | null) {
  return countryCode?.toUpperCase() === "CL" ? "12.345.678-9" : "Documento nacional";
}

export function normalizeDocument(countryCode: string | null | undefined, value: string) {
  const normalized = value.trim().toUpperCase();
  if (countryCode?.toUpperCase() === "CL") {
    return normalized.replace(/\./g, "").replace(/-/g, "").replace(/\s+/g, "");
  }
  return normalized.replace(/\s+/g, " ");
}

function validateChileRut(normalizedRut: string) {
  if (!/^\d{7,8}[\dK]$/.test(normalizedRut)) {
    return { valid: false, reason: "RUT inválido. Use formato 12.345.678-9." };
  }
  const body = normalizedRut.slice(0, -1);
  const verifier = normalizedRut.slice(-1);
  let multiplier = 2;
  let sum = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const expected = 11 - (sum % 11);
  const expectedDigit = expected === 11 ? "0" : expected === 10 ? "K" : String(expected);
  return expectedDigit === verifier
    ? { valid: true }
    : { valid: false, reason: "Dígito verificador de RUT inválido." };
}

export function validateDocument(countryCode: string | null | undefined, value: string) {
  const normalized = normalizeDocument(countryCode, value);
  if (countryCode?.toUpperCase() === "CL") return validateChileRut(normalized);
  if (normalized.length < 4) return { valid: false, reason: "El documento debe tener al menos 4 caracteres." };
  if (normalized.length > 40) return { valid: false, reason: "El documento supera el largo máximo permitido." };
  return { valid: true };
}

export function getDocumentHelpText(countryCode?: string | null) {
  if (countryCode?.toUpperCase() === "CL") {
    return "Se normaliza quitando puntos, guion y espacios. Sólo se guarda hash.";
  }
  return "Validación básica por país pendiente. ARGUS guarda sólo hash, no texto plano.";
}

