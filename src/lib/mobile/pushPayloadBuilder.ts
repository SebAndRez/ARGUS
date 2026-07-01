import type { MobilePushMessageType } from "@/types/mobileApiContracts";

export interface ArgusPushPayload {
  type: MobilePushMessageType;
  title: string;
  body: string;
  priority: "normal" | "high";
  ttlSeconds: number;
  deepLink: string;
  privacy: "public_safe" | "private_minimal";
  data: Record<string, string>;
}

function buildPayload(payload: ArgusPushPayload) {
  return payload;
}

export function buildSafetyCheckPush(checkInId = "preview-check") {
  return buildPayload({
    type: "SAFETY_CHECK",
    title: "ARGUS Safety Check",
    body: "Confirme si esta bien o necesita ayuda.",
    priority: "high",
    ttlSeconds: 300,
    deepLink: `argus://safety-check/${checkInId}`,
    privacy: "private_minimal",
    data: { checkInId },
  });
}

export function buildPossibleCrashPush(checkInId = "preview-crash") {
  return buildPayload({
    type: "POSSIBLE_CRASH",
    title: "Posible accidente detectado",
    body: "ARGUS necesita confirmar su estado.",
    priority: "high",
    ttlSeconds: 180,
    deepLink: `argus://safety-check/${checkInId}`,
    privacy: "private_minimal",
    data: { checkInId },
  });
}

export function buildPossibleQuakePush() {
  return buildPayload({
    type: "POSSIBLE_QUAKE",
    title: "Posible sacudida detectada",
    body: "Revise fuentes oficiales y confirme su estado si es seguro.",
    priority: "normal",
    ttlSeconds: 300,
    deepLink: "argus://modules/quakesense",
    privacy: "public_safe",
    data: {},
  });
}

export function buildPossibleFallPush(checkInId = "preview-fall") {
  return buildPayload({
    type: "POSSIBLE_FALL",
    title: "Posible caida detectada",
    body: "ARGUS necesita confirmar si requiere ayuda.",
    priority: "high",
    ttlSeconds: 180,
    deepLink: `argus://safety-check/${checkInId}`,
    privacy: "private_minimal",
    data: { checkInId },
  });
}

export function buildDeadManSwitchPush(checkInId = "preview-deadman") {
  return buildPayload({
    type: "DEAD_MAN_CHECK",
    title: "Check-in pendiente",
    body: "Confirme su estado para evitar una alerta de no respuesta.",
    priority: "high",
    ttlSeconds: 300,
    deepLink: `argus://safety-check/${checkInId}`,
    privacy: "private_minimal",
    data: { checkInId },
  });
}

export function buildTestPush() {
  return buildPayload({
    type: "TEST",
    title: "Prueba ARGUS",
    body: "Payload de prueba. No se envio ninguna notificacion real.",
    priority: "normal",
    ttlSeconds: 60,
    deepLink: "argus://test",
    privacy: "public_safe",
    data: { mode: "preview" },
  });
}
