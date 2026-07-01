export type ProductStatusKind =
  | "REAL"
  | "OFFICIAL_SOURCE"
  | "EXTERNAL_VERIFIED"
  | "CITIZEN_REPORT"
  | "ARGUS_ESTIMATE"
  | "EXPERIMENTAL"
  | "DEMO"
  | "RUNTIME_ONLY"
  | "FUTURE"
  | "DISABLED";

export type ProductStatusDefinition = {
  kind: ProductStatusKind;
  label: string;
  description: string;
  tone: "cyan" | "emerald" | "amber" | "orange" | "red" | "slate" | "violet";
};
