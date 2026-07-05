export const diseaseDictionary = [
  "Ebola",
  "Marburg",
  "cholera",
  "measles",
  "MERS",
  "avian influenza",
  "influenza A",
  "hantavirus",
  "mpox",
  "dengue",
  "yellow fever",
  "polio",
  "meningitis",
  "plague",
  "lassa fever",
  "rift valley fever",
  "zika",
  "chikungunya",
  "COVID-19",
  "novel coronavirus",
  "acute watery diarrhoea",
  "viral haemorrhagic fever",
  "West Nile virus",
  "SARS-CoV-2",
  "legionnaires disease",
  "listeriosis",
  "salmonellosis",
  "hepatitis A",
  "hepatitis E",
  "tuberculosis",
  "antimicrobial resistance",
];

export function extractDisease(text: string) {
  const lower = text.toLowerCase();
  return diseaseDictionary.find((item) => lower.includes(item.toLowerCase())) ?? "unknown disease";
}
