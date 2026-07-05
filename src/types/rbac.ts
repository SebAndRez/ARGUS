export type ArgusRole =
  | "PUBLIC"
  | "CITIZEN"
  | "VERIFIED_CITIZEN"
  | "TRUSTED_CITIZEN"
  | "OPERATOR"
  | "ANALYST"
  | "MEDICAL_OPERATOR"
  | "LOGISTICS"
  | "INSTITUTIONAL_ADMIN"
  | "POLICE"
  | "AUTHORITY"
  | "ADMIN"
  | "SUPER_ADMIN";

export interface RbacUser {
  id?: string | null;
  role?: string | null;
  accountStatus?: string | null;
  governmentIdHash?: string | null;
}
