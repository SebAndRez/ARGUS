export function buildWhoDonAuraContext(context: Record<string, unknown>) {
  return {
    sourceId: "who-don",
    publicHealthContext: context,
    notMedicalDiagnosis: true,
    followLocalHealthAuthorities: true,
    allowedMessage: "WHO has published Disease Outbreak News for this event. This is public health context, not a diagnosis.",
    evidenceRefs: [],
  };
}
