import type { CrisisSourceRegistryEntry } from "@/types/crisisSource";

export const conflictSourceRegistry: CrisisSourceRegistryEntry[] = [
  {
    id: "gdelt",
    name: "GDELT",
    status: "active",
    accessType: "free",
    sourceTier: "osint",
    reliabilityScore: 62,
    url: "https://www.gdeltproject.org/",
    notes:
      "Fuente abierta gratuita para senales geolocalizadas. ARGUS la presenta como open_source_signal, no confirmacion absoluta.",
  },
  {
    id: "reliefweb",
    name: "ReliefWeb",
    status: "active",
    accessType: "free",
    sourceTier: "technical",
    reliabilityScore: 82,
    url: "https://reliefweb.int/",
    notes:
      "Fuente humanitaria y de desastre para contexto, reportes y crisis confirmadas.",
  },
  {
    id: "liveuamap",
    name: "Liveuamap",
    status: "manual_reference",
    accessType: "paid_or_partner",
    sourceTier: "osint",
    reliabilityScore: 58,
    url: "https://liveuamap.com/",
    notes:
      "Referencia visual/manual. Integracion API futura si existe acceso autorizado; no scraping.",
  },
  {
    id: "acled",
    name: "ACLED",
    status: "disabled",
    accessType: "api_key",
    sourceTier: "technical",
    reliabilityScore: 86,
    url: "https://acleddata.com/",
    notes:
      "Fuente estructurada de mayor calidad cuando existan credenciales; no inventar datos sin acceso.",
  },
  {
    id: "major_media",
    name: "Major international media",
    status: "manual_reference",
    accessType: "manual_reference",
    sourceTier: "major_media",
    reliabilityScore: 70,
    notes:
      "Reuters, AP, BBC, CNN, DW, Al Jazeera, The Guardian, France24 y Euronews como evidencia secundaria via GDELT/RSS autorizado o registro manual.",
  },
];
