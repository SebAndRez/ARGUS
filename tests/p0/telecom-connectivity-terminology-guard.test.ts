import { describe, expect, it } from "vitest";
import { ROAMING_TYPES, REJECTED_ROAMING_TYPE } from "@/lib/connectivity/telecomConnectivityService";
import {
  ANDROID_INSTRUCTIONS,
  IPHONE_INSTRUCTIONS,
  WARNINGS,
  MANUFACTURER_VARIANCE_DISCLAIMER,
} from "@/content/telecomConnectivityGuidance";

/**
 * Guardia automatizada de terminologia (spec ARGUS v1.0.3.6 §3/§7/§10/§21):
 * roaming internacional nunca debe ser un valor valido de activacion, y el
 * contenido ciudadano nunca debe usar frases absolutas ("garantizadamente")
 * ni presentar roaming internacional como instruccion de emergencia.
 */

const REQUIRED_CONFIRMED_STRING = "Roaming de emergencia activo en las zonas informadas por la autoridad.";
const REQUIRED_UNCONFIRMED_STRING = "Roaming de emergencia: sin activación oficial confirmada.";

const BANNED_PHRASES = ["conectará garantizadamente", "garantiza cobertura", "roaming internacional"];

function assertNoBannedPhrase(text: string) {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    expect(lower.includes(phrase.toLowerCase())).toBe(false);
  }
}

describe("vocabulario de roaming — sin conflacion con roaming internacional", () => {
  it("ROAMING_TYPES nunca incluye 'roaming_internacional'", () => {
    expect(ROAMING_TYPES).not.toContain("roaming_internacional");
    expect(ROAMING_TYPES).not.toContain(REJECTED_ROAMING_TYPE);
  });

  it("ROAMING_TYPES distingue explicitamente nacional de emergencia", () => {
    expect(ROAMING_TYPES).toContain("roaming_automatico_nacional");
    expect(ROAMING_TYPES).toContain("roaming_emergencia");
  });
});

describe("copy ciudadano — sin promesas absolutas ni conflacion con roaming internacional", () => {
  it("los dos mensajes requeridos por spec §7 no contienen frases prohibidas", () => {
    assertNoBannedPhrase(REQUIRED_CONFIRMED_STRING);
    assertNoBannedPhrase(REQUIRED_UNCONFIRMED_STRING);
  });

  it("instrucciones Android/iPhone y advertencias no contienen frases prohibidas", () => {
    for (const line of [...ANDROID_INSTRUCTIONS, ...IPHONE_INSTRUCTIONS, ...WARNINGS, MANUFACTURER_VARIANCE_DISCLAIMER]) {
      assertNoBannedPhrase(line);
    }
  });

  it("las advertencias incluyen la limitacion central: el roaming no crea señal donde no hay cobertura", () => {
    const hasCoverageLimitWarning = WARNINGS.some((warning) => warning.toLowerCase().includes("no crea señal"));
    expect(hasCoverageLimitWarning).toBe(true);
  });
});
