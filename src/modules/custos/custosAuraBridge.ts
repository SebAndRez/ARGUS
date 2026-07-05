export function convertAuraMedicalTransferToCustosStatus(auraSignals: Array<Record<string, unknown>>) {
  return auraSignals.map((signal, index) => ({ id: `custos-aura-${index}`, status: "medical_attention", label: signal.label ?? "Estado medico general restringido", clinicalDataIncluded: false }));
}
