import { generateGovernmentIdHash } from "@/services/govIdentity/govIdentityProvider";

export type EmailVerificationState =
  | "verified"
  | "pending_verification"
  | "missing"
  | "change_pending";

export type MinimalIdentityUser = {
  email?: string | null;
  emailVerifiedAt?: Date | string | null;
  governmentIdHash?: string | null;
  countryCode?: string | null;
  city?: string | null;
  publicAlias?: string | null;
  termsAcceptedAt?: Date | string | null;
  privacyAcceptedAt?: Date | string | null;
  profileCompletedAt?: Date | string | null;
};

export function normalizeGovIdInput(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function hashGovId(value: string) {
  return generateGovernmentIdHash(normalizeGovIdInput(value));
}

export function getEmailVerificationState(user: MinimalIdentityUser): EmailVerificationState {
  if (!user.email) return "missing";
  if (user.emailVerifiedAt) return "verified";
  return "pending_verification";
}

export function canAttachEmailToIdentity(input: {
  existingEmailUserId?: string | null;
  targetUserId?: string | null;
  emailVerified: boolean;
}) {
  if (input.existingEmailUserId && input.existingEmailUserId !== input.targetUserId) {
    return {
      allowed: false,
      reason: "Este correo ya está asociado a otra cuenta ARGUS.",
    };
  }

  if (!input.emailVerified) {
    return {
      allowed: false,
      reason: "El correo debe verificarse antes de quedar activo en producción.",
    };
  }

  return { allowed: true, reason: "Correo verificable para esta identidad." };
}

export function canChangeAccountEmail(input: {
  currentEmail?: string | null;
  requestedEmail?: string | null;
  newEmailVerified: boolean;
}) {
  const requestedEmail = input.requestedEmail?.trim().toLowerCase();
  if (!requestedEmail) {
    return { allowed: false, reason: "Debe indicar un correo nuevo." };
  }
  if (requestedEmail === input.currentEmail?.trim().toLowerCase()) {
    return { allowed: false, reason: "El correo nuevo es igual al correo actual." };
  }
  if (!input.newEmailVerified) {
    return {
      allowed: false,
      reason: "El correo actual se mantiene hasta verificar el nuevo correo.",
    };
  }
  return { allowed: true, reason: "Cambio de correo listo para auditoría." };
}

export function buildDuplicateIdentityMessage() {
  return "Este documento ya está asociado a una cuenta ARGUS. Inicia sesión con el correo asociado o solicita cambio de correo.";
}

export function requiresProfileCompletion(user: MinimalIdentityUser | null | undefined) {
  if (!user) return true;
  return (
    !user.email ||
    !user.governmentIdHash ||
    !user.countryCode ||
    !user.city ||
    !user.publicAlias ||
    !user.termsAcceptedAt ||
    !user.privacyAcceptedAt ||
    !user.profileCompletedAt
  );
}
