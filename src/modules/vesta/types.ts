export type VestaChecklistCategory =
  | "water_food"
  | "first_aid"
  | "medications"
  | "documents"
  | "power_comms"
  | "hygiene"
  | "clothing"
  | "pets"
  | "babies_children"
  | "elderly_dependents"
  | "tools"
  | "money_keys";

export type VestaChecklistStatus =
  | "pending"
  | "ready"
  | "expiresSoon"
  | "review"
  | "notApplicable";

export type VestaReminderType =
  | "check_backpack"
  | "change_water"
  | "check_food"
  | "check_medications"
  | "charge_power_bank"
  | "update_documents"
  | "practice_family_drill"
  | "custom";

export type VestaReminderStatus = "pending" | "done" | "skipped";

export type VestaThreatType =
  | "earthquake"
  | "tsunami"
  | "wildfire"
  | "flood"
  | "power_outage"
  | "medical_emergency"
  | "general_evacuation";

export interface VestaChecklistItem {
  id: string;
  category: VestaChecklistCategory;
  label: string;
  status: VestaChecklistStatus;
  isCustom: boolean;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VestaFamilyMember {
  name: string;
  relationship?: string;
  isDependent?: boolean;
  medicalNotes?: string;
}

export interface VestaEmergencyContact {
  id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  priority: number;
}

export interface VestaFamilyPlan {
  members: VestaFamilyMember[];
  primaryMeetingPoint: string | null;
  alternateMeetingPoint: string | null;
  evacuationRouteNotes: string | null;
  medicalNeedsNotes: string | null;
  petsNotes: string | null;
  observations: string | null;
  updatedAt: string | null;
}

export interface VestaReminder {
  id: string;
  type: VestaReminderType;
  title: string;
  dueAt: string;
  frequencyDays: number | null;
  status: VestaReminderStatus;
  lastCompletedAt: string | null;
}

export interface VestaThreatGuideSourceReference {
  name: string;
  url: string;
  organization: string;
}

export interface VestaThreatGuide {
  threatType: VestaThreatType;
  title: string;
  recommendations: string[];
  sourceReferences: VestaThreatGuideSourceReference[];
}

export interface VestaCategoryProgress {
  category: VestaChecklistCategory;
  total: number;
  ready: number;
  percentage: number;
}

export interface VestaProfileSummary {
  hasProfile: boolean;
  lastFullReviewAt: string | null;
  riskContexts: VestaThreatType[];
  overallPercentage: number;
  categoryProgress: VestaCategoryProgress[];
  checklist: VestaChecklistItem[];
  familyPlan: VestaFamilyPlan;
  emergencyContacts: VestaEmergencyContact[];
  reminders: VestaReminder[];
}
