export type ArgusSourceReliability =
  | "official"
  | "open_data"
  | "argus_demo"
  | "user_aggregate"
  | "estimated";

export type ArgusSourceAttribution = {
  id: string;
  name: string;
  category: string;
  reliability: ArgusSourceReliability;
  isOfficial: boolean;
  url?: string;
  usedFor: string;
  note: string;
};

export type ArgusDataQuality = {
  level: "low" | "medium" | "high";
  score: number;
  label: string;
  limitations: string[];
};
