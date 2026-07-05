export function buildEcdcAuraContext(context: Record<string, unknown>) {
  return {
    sourceId: "ecdc",
    regionalPublicHealthContext: context,
    notMedicalDiagnosis: true,
    caveats: ["ECDC context is regional EU/EEA public health reporting, not clinical advice."],
    evidenceRefs: [],
  };
}
