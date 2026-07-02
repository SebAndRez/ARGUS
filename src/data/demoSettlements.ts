export type DemoSettlement = {
  id: string;
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  population: number;
  sourceType: "DEMO";
  isDemo: true;
};

export const demoSettlements: DemoSettlement[] = [
  { id: "cl-santiago", name: "Santiago", countryCode: "CL", latitude: -33.4489, longitude: -70.6693, population: 7000000, sourceType: "DEMO", isDemo: true },
  { id: "cl-valparaiso", name: "Valparaíso", countryCode: "CL", latitude: -33.0472, longitude: -71.6127, population: 296000, sourceType: "DEMO", isDemo: true },
  { id: "cl-vina", name: "Viña del Mar", countryCode: "CL", latitude: -33.0245, longitude: -71.5518, population: 335000, sourceType: "DEMO", isDemo: true },
  { id: "cl-concepcion", name: "Concepción", countryCode: "CL", latitude: -36.8201, longitude: -73.0444, population: 945000, sourceType: "DEMO", isDemo: true },
  { id: "cl-temuco", name: "Temuco", countryCode: "CL", latitude: -38.7359, longitude: -72.5904, population: 290000, sourceType: "DEMO", isDemo: true },
  { id: "cl-antofagasta", name: "Antofagasta", countryCode: "CL", latitude: -23.6509, longitude: -70.3975, population: 425000, sourceType: "DEMO", isDemo: true },
  { id: "cl-la-serena", name: "La Serena", countryCode: "CL", latitude: -29.9027, longitude: -71.2519, population: 250000, sourceType: "DEMO", isDemo: true },
  { id: "cl-puerto-montt", name: "Puerto Montt", countryCode: "CL", latitude: -41.4693, longitude: -72.9424, population: 245000, sourceType: "DEMO", isDemo: true },
  { id: "ar-buenos-aires", name: "Buenos Aires", countryCode: "AR", latitude: -34.6037, longitude: -58.3816, population: 15600000, sourceType: "DEMO", isDemo: true },
  { id: "pe-lima", name: "Lima", countryCode: "PE", latitude: -12.0464, longitude: -77.0428, population: 11000000, sourceType: "DEMO", isDemo: true },
  { id: "br-sao-paulo", name: "São Paulo", countryCode: "BR", latitude: -23.5505, longitude: -46.6333, population: 22000000, sourceType: "DEMO", isDemo: true },
  { id: "uy-montevideo", name: "Montevideo", countryCode: "UY", latitude: -34.9011, longitude: -56.1645, population: 1700000, sourceType: "DEMO", isDemo: true }
];

