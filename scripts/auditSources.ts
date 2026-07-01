import { buildSourceHealthSummary } from "../src/lib/sources/sourceHealthEngine";

const summary = buildSourceHealthSummary();

console.log(
  JSON.stringify(
    {
      generatedAt: summary.generatedAt,
      totalSources: summary.totalSources,
      active: summary.active,
      degraded: summary.degraded,
      disabled: summary.disabled,
      demo: summary.demo,
      needsKey: summary.needsKey,
      needsReview: summary.needsReview,
      officialCount: summary.officialCount,
      citizenCount: summary.citizenCount,
      sensorCount: summary.sensorCount,
      sources: summary.sources.map((source) => ({
        id: source.id,
        name: source.name,
        category: source.category,
        reliability: source.reliability,
        status: source.status,
        requiresKey: source.requiresKey,
        isOfficial: source.isOfficial,
        isDemo: source.isDemo,
        refreshIntervalMinutes: source.refreshIntervalMinutes,
        warnings: source.warnings,
      })),
      privacy: "No API keys or secrets are read or printed.",
    },
    null,
    2
  )
);

export {};
