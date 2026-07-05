export const countryNames = [
  "Afghanistan", "Argentina", "Australia", "Belgium", "Brazil", "Canada", "Chile", "China", "Colombia", "Democratic Republic of the Congo", "Ecuador", "Egypt", "Ethiopia", "France", "Germany", "Ghana", "Guinea", "India", "Indonesia", "Italy", "Japan", "Kenya", "Mexico", "Mozambique", "Nigeria", "Pakistan", "Peru", "Philippines", "South Africa", "Spain", "Sudan", "Uganda", "Ukraine", "United Kingdom", "United States", "Viet Nam", "Yemen", "Zimbabwe",
];

export function extractCountries(text: string) {
  const lower = text.toLowerCase();
  return countryNames.filter((country) => lower.includes(country.toLowerCase()));
}
