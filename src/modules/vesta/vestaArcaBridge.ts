import { VESTA_THREAT_GUIDES } from "@/modules/vesta/data";

/**
 * Convierte refugios ARCA (públicos) en sugerencias de punto de encuentro /
 * zona segura para el plan familiar de VESTA. No persiste nada: solo
 * reformatea datos que ya existen en ARCA.
 */
export function suggestVestaMeetingPointsFromArcaShelters(
  shelters: Array<{ id: string; name: string; location: { lat: number; lng: number; label?: string }; status?: string }>
) {
  return shelters
    .filter((shelter) => shelter.status !== "closed")
    .map((shelter) => ({
      shelterId: shelter.id,
      label: shelter.location.label ?? shelter.name,
      lat: shelter.location.lat,
      lng: shelter.location.lng,
    }));
}

/**
 * Expone las referencias oficiales (SENAPRED, Ready.gov/FEMA, Cruz Roja) de
 * las guías de amenaza de VESTA en el mismo formato de "fuente externa
 * oficial" que usa el registro de fuentes de conocimiento de ARGUS, para que
 * ARCA pueda listarlas como referencias externas sin duplicar el contenido.
 */
export function getVestaOfficialSourceReferencesForArca() {
  const seen = new Map<string, { name: string; url: string; organization: string }>();
  for (const guide of VESTA_THREAT_GUIDES) {
    for (const reference of guide.sourceReferences) {
      seen.set(reference.url, reference);
    }
  }
  return Array.from(seen.values());
}
