import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

export function validatePasswordStrength(password: string) {
  if (!password) return { valid: false, reason: "Contraseña requerida." };
  if (password.length < 8) {
    return { valid: false, reason: "La contraseña debe tener al menos 8 caracteres." };
  }
  return {
    valid: true,
    reason: "Contraseña válida para Alpha Preview. Se recomienda usar mayúsculas, minúsculas y números.",
  };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash?: string | null) {
  if (!storedHash) return false;
  const [algorithm, salt, expectedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return false;
  const actual = Buffer.from(scryptSync(password, salt, KEY_LENGTH).toString("hex"));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

