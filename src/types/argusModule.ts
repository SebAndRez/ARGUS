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

/**
 * Capability-truth classification (ARGUS Prompt 18 — secondary module
 * stabilization). Independent from `status`/`visibility`/`accessType`,
 * which describe *access tier*, not *how real the underlying data is*.
 * A module can be `restricted` in access terms while its capability axis
 * is `preview` (e.g. CUSTOS: correctly gated to police roles, but every
 * search still returns fixed demo data).
 *
 * - operational: real backend, real persistence, tests, no hidden demo fallback.
 * - partially_operational: some functions are real, others aren't — must be
 *   itemized in `maturityNotes`.
 * - restricted: the function is real but requires specific access (access
 *   tier already carries most of this via `visibility`/`accessType`).
 * - preview: interface exists as a demo/prototype; must be labeled as such.
 * - planned: only a concept, stub, or documentation exists.
 * - disabled: code exists but must not be used (risk/inconsistency).
 *
 * Optional and only populated where it has been explicitly audited against
 * code — absence does not imply "operational".
 */
export type ModuleMaturity =
  | "operational"
  | "partially_operational"
  | "restricted"
  | "preview"
  | "planned"
  | "disabled";

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
  /** Capability-truth classification — see `ModuleMaturity`. Optional: only set where audited. */
  maturity?: ModuleMaturity;
  /** Short, explicit list of what's real vs. demo/incomplete. Required whenever `maturity` is set. */
  maturityNotes?: string[];
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
