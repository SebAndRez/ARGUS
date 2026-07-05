export function convertVigiaReportsToFenixSignals(reports: unknown[]) {
  return { reportCount: reports.length, personalDataIncluded: false, signals: reports };
}
