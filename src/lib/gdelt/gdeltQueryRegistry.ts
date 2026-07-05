export type GdeltTemplate = {
  id: string;
  label: string;
  hazardType: string;
  purpose: string;
  queryTerms: string[];
  defaultTimespan: string;
  maxRecords: number;
  modes: string[];
  caveats: string[];
  citizenAllowed: false;
  analystAllowed: true;
  commandCenterAllowed: true;
};

export const gdeltQueryRegistry: GdeltTemplate[] = [
  ["gdelt-earthquake-tsunami-media", "Earthquake / tsunami media", "earthquake", ["earthquake", "tsunami", "aftershock"]],
  ["gdelt-wildfire-smoke-media", "Wildfire / smoke media", "wildfire", ["wildfire", "forest fire", "smoke"]],
  ["gdelt-flood-disaster-media", "Flood disaster media", "flood", ["flood", "flooding", "flash flood"]],
  ["gdelt-protest-unrest-media", "Protest / unrest media", "civil_unrest", ["protest", "riot", "clashes", "unrest"]],
  ["gdelt-explosion-attack-media", "Explosion / attack media", "explosion", ["explosion", "attack", "blast"]],
  ["gdelt-public-health-outbreak-media", "Public health outbreak media", "public_health", ["outbreak", "cholera", "Ebola", "mpox", "dengue"]],
  ["gdelt-infrastructure-collapse-media", "Infrastructure collapse media", "industrial_accident", ["bridge collapse", "dam failure", "blackout", "train derailment"]],
  ["gdelt-humanitarian-crisis-media", "Humanitarian crisis media", "humanitarian_crisis", ["displacement", "refugees", "humanitarian aid", "food insecurity"]],
].map(([id, label, hazardType, queryTerms]) => ({
  id: id as string,
  label: label as string,
  hazardType: hazardType as string,
  purpose: "command_center_osint",
  queryTerms: queryTerms as string[],
  defaultTimespan: "24h",
  maxRecords: 75,
  modes: ["artlist", "timelinevol", "timelinetone", "timelinesourcecountry", "timelinelang"],
  caveats: ["GDELT is media signal context only and does not confirm incidents by itself."],
  citizenAllowed: false,
  analystAllowed: true,
  commandCenterAllowed: true,
}));

export function getGdeltTemplate(id?: string) {
  return gdeltQueryRegistry.find((item) => item.id === id);
}
