export type AccessLayer =
  | "PUBLIC_CORE"
  | "AUTHENTICATED_CITIZEN"
  | "VERIFIED_CITIZEN"
  | "OPERATOR"
  | "ANALYST"
  | "INSTITUTIONAL_COMMAND"
  | "API_CLIENT"
  | "ADMIN"
  | "SUPER_ADMIN";

export type ProductSurface =
  | "ARGUS_CORE"
  | "ARGUS_MOBILE"
  | "ARGUS_COMMAND"
  | "ARGUS_API"
  | "ARGUS_DATA"
  | "AURA_PRO"
  | "FENIX_TWIN"
  | "ROUTING_INTELLIGENCE"
  | "SENSOR_SAFETY";

export type AccessDecision =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_AUTH"
  | "REQUIRE_VERIFICATION"
  | "REQUIRE_CONTRACT"
  | "REQUIRE_ADMIN"
  | "DEMO_ONLY";

export type ApiAccessTier =
  | "NONE"
  | "INTERNAL"
  | "PARTNER"
  | "INSTITUTIONAL"
  | "ENTERPRISE"
  | "SUSPENDED";

export interface AccessSubject {
  id?: string | null;
  role?: string | null;
  accountStatus?: string | null;
  governmentIdHash?: string | null;
  apiTier?: ApiAccessTier | null;
}

export interface SurfaceAccessRequirement {
  surface: ProductSurface;
  minimumLayer: AccessLayer;
  decisionIfMissing: AccessDecision;
  sensitive: boolean;
  demoAllowed: boolean;
}
