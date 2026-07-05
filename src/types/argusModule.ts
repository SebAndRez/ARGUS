import type { ArgusRole } from "@/types/rbac";

/**
 * ARGUS Core + módulos verticales.
 * Este archivo define la metadata estática que describe cada módulo comercial
 * de ARGUS (AURA, FENIX, ATLAS, CUSTOS, HERMES, ARCA, NEXUS, ORACULO, VIGIA,
 * TALOS). No contiene lógica de negocio: solo la forma de los datos que
 * consume el registro (`src/data/argusModules.ts`) y el control de acceso
 * (`src/lib/modules/moduleAccess.ts`).
 */

export type ModuleStatus =
  | "active"
  | "beta"
  | "coming_soon"
  | "institutional"
  | "paid"
  | "restricted"
  | "internal";

export type ModuleVisibility =
  | "public"
  | "authenticated"
  | "institutional"
  | "restricted"
  | "hidden";

export type ModuleAccessType =
  | "public"
  | "verified"
  | "paid"
  | "institutional"
  | "analyst"
  | "medical"
  | "emergency"
  | "logistics"
  | "police_only"
  | "admin_only"
  | "superadmin_only";

export type ModuleCategory =
  | "medical"
  | "predictive"
  | "command"
  | "security"
  | "mobility"
  | "shelter"
  | "logistics"
  | "intelligence"
  | "citizen"
  | "risk";

export type ModuleBadgeVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "institutional"
  | "paid";

export interface ArgusModuleDefinition {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  status: ModuleStatus;
  category: ModuleCategory;
  visibility: ModuleVisibility;
  accessType: ModuleAccessType;
  allowedRoles: ArgusRole[];
  isPaid: boolean;
  isRestricted: boolean;
  isPublic: boolean;
  requiresAudit: boolean;
  requiresOperationalReason: boolean;
  menuOrder: number;
  icon: string;
  color: string;
  route: string;
  badgeLabel: string;
  badgeVariant: ModuleBadgeVariant;
  /** "Capacidades previstas" shown on the module placeholder page. */
  capabilitiesPreview: string[];
  /** "Integraciones futuras" shown on the module placeholder page. */
  futureIntegrations: string[];
}

export interface ModuleAccessResult {
  canView: boolean;
  canEnter: boolean;
  reason?: string;
}
