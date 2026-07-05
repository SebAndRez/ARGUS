export function convertVigiaMissingPersonContextToCustosSignal(reports: Array<Record<string, unknown>>) {
  return reports.filter((report) => report.status !== "rejected").map((report, index) => ({ id: `custos-vigia-${index}`, sourceReportId: report.id, confidence: report.status === "confirmed" ? "high" : "medium", personalReporterDataIncluded: false }));
}
