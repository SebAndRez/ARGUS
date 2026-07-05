export function convertVigiaMedicalReportsToAuraCases(reports: Array<Record<string, unknown>>) {
  return reports
    .filter((report) => report.status !== "rejected")
    .map((report, index) => ({
      id: `aura-vigia-case-${index}`,
      sourceReportId: String(report.id ?? index),
      urgency: report.status === "confirmed" ? "high" : "medium",
      status: report.status === "confirmed" ? "waiting" : "new",
      personalDataIncluded: false,
      warning: report.status === "pending" ? "Reporte pendiente; no exponer datos personales." : undefined,
    }));
}
