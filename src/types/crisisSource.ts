export type CrisisSourceStatus = "active" | "disabled" | "manual_reference";
export type CrisisSourceAccessType =
  | "free"
  | "api_key"
  | "paid_or_partner"
  | "manual_reference";

export interface CrisisSourceRegistryEntry {
  id: string;
  name: string;
  status: CrisisSourceStatus;
  accessType: CrisisSourceAccessType;
  sourceTier: "official" | "technical" | "major_media" | "osint" | "unknown";
  reliabilityScore: number;
  notes: string;
  url?: string;
}
