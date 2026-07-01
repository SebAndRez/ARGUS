import type {
  AccessDecision,
  AccessSubject,
  ApiAccessTier,
  ProductSurface,
  SurfaceAccessRequirement,
} from "@/types/accessControl";

const institutionalRoles = new Set([
  "OPERATOR",
  "ANALYST",
  "ADMIN",
  "SUPER_ADMIN",
  "INSTITUTIONAL_ADMIN",
  "MEDICAL_OPERATOR",
]);

const adminRoles = new Set(["ADMIN", "SUPER_ADMIN"]);

const requirements: Record<ProductSurface, SurfaceAccessRequirement> = {
  ARGUS_CORE: {
    surface: "ARGUS_CORE",
    minimumLayer: "PUBLIC_CORE",
    decisionIfMissing: "ALLOW",
    sensitive: false,
    demoAllowed: true,
  },
  ARGUS_MOBILE: {
    surface: "ARGUS_MOBILE",
    minimumLayer: "AUTHENTICATED_CITIZEN",
    decisionIfMissing: "REQUIRE_AUTH",
    sensitive: true,
    demoAllowed: true,
  },
  ARGUS_COMMAND: {
    surface: "ARGUS_COMMAND",
    minimumLayer: "OPERATOR",
    decisionIfMissing: "REQUIRE_CONTRACT",
    sensitive: true,
    demoAllowed: false,
  },
  ARGUS_API: {
    surface: "ARGUS_API",
    minimumLayer: "API_CLIENT",
    decisionIfMissing: "REQUIRE_CONTRACT",
    sensitive: true,
    demoAllowed: false,
  },
  ARGUS_DATA: {
    surface: "ARGUS_DATA",
    minimumLayer: "API_CLIENT",
    decisionIfMissing: "REQUIRE_CONTRACT",
    sensitive: true,
    demoAllowed: false,
  },
  AURA_PRO: {
    surface: "AURA_PRO",
    minimumLayer: "INSTITUTIONAL_COMMAND",
    decisionIfMissing: "REQUIRE_CONTRACT",
    sensitive: true,
    demoAllowed: true,
  },
  FENIX_TWIN: {
    surface: "FENIX_TWIN",
    minimumLayer: "INSTITUTIONAL_COMMAND",
    decisionIfMissing: "DEMO_ONLY",
    sensitive: true,
    demoAllowed: true,
  },
  ROUTING_INTELLIGENCE: {
    surface: "ROUTING_INTELLIGENCE",
    minimumLayer: "AUTHENTICATED_CITIZEN",
    decisionIfMissing: "DEMO_ONLY",
    sensitive: false,
    demoAllowed: true,
  },
  SENSOR_SAFETY: {
    surface: "SENSOR_SAFETY",
    minimumLayer: "AUTHENTICATED_CITIZEN",
    decisionIfMissing: "DEMO_ONLY",
    sensitive: true,
    demoAllowed: true,
  },
};

export function getRequiredAccess(surface: ProductSurface) {
  return requirements[surface];
}

export function canAccessSurface(
  user: AccessSubject | null | undefined,
  surface: ProductSurface
): AccessDecision {
  const requirement = getRequiredAccess(surface);

  if (requirement.minimumLayer === "PUBLIC_CORE") return "ALLOW";
  if (!user?.id && requirement.demoAllowed) return "DEMO_ONLY";
  if (!user?.id) return "REQUIRE_AUTH";
  if (user.accountStatus === "BANNED") return surface === "ARGUS_CORE" ? "ALLOW" : "DENY";

  if (surface === "ARGUS_API" || surface === "ARGUS_DATA") {
    return canUseApiClient(user.apiTier ?? "NONE") ? "ALLOW" : "REQUIRE_CONTRACT";
  }

  if (["ARGUS_COMMAND", "AURA_PRO", "FENIX_TWIN"].includes(surface)) {
    return institutionalRoles.has(user.role ?? "") ? "ALLOW" : requirement.decisionIfMissing;
  }

  if (requirement.minimumLayer === "VERIFIED_CITIZEN" && !user.governmentIdHash) {
    return "REQUIRE_VERIFICATION";
  }

  return "ALLOW";
}

export function canUseInstitutionalFeature(
  user: AccessSubject | null | undefined,
  feature: ProductSurface
) {
  return canAccessSurface(user, feature) === "ALLOW";
}

export function canUseApiClient(tier: ApiAccessTier | null | undefined) {
  return Boolean(tier && !["NONE", "SUSPENDED"].includes(tier));
}

export function buildAccessDeniedMessage(reason: AccessDecision) {
  const messages: Record<AccessDecision, string> = {
    ALLOW: "Acceso permitido.",
    DENY: "Acceso denegado por politica ARGUS.",
    REQUIRE_AUTH: "Debe iniciar sesion para usar esta funcion.",
    REQUIRE_VERIFICATION: "Esta funcion requiere cuenta verificada.",
    REQUIRE_CONTRACT: "Esta funcion requiere autorizacion formal o convenio.",
    REQUIRE_ADMIN: "Esta funcion requiere rol administrador.",
    DEMO_ONLY: "Esta funcion esta disponible solo como demo en esta fase.",
  };
  return messages[reason];
}

export function isDemoOnlyFeature(feature: ProductSurface) {
  return getRequiredAccess(feature).demoAllowed && feature !== "ARGUS_CORE";
}

export function isAdminSubject(user: AccessSubject | null | undefined) {
  return adminRoles.has(user?.role ?? "");
}
