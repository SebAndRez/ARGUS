import { NextResponse } from "next/server";
import { knowledgeSourceRegistry } from "@/data/knowledgeSourceRegistry";
import { buildSourceHealthSummary } from "@/lib/sources/sourceHealthEngine";
import { getAllSourceGovernancePolicies } from "@/lib/source-governance/sourceGovernanceRegistry";

export const dynamic = "force-dynamic";

export async function GET() {
  const healthById = new Map(buildSourceHealthSummary().sources.map((source) => [source.id, source]));
  const knowledgeById = new Map(knowledgeSourceRegistry.map((source) => [source.id, source]));

  const sources = getAllSourceGovernancePolicies().map((policy) => {
    const registry = knowledgeById.get(policy.sourceId);
    const health = healthById.get(policy.sourceId);
    return {
      sourceId: policy.sourceId,
      sourceName: policy.sourceName ?? registry?.name ?? policy.sourceId,
      registryStatus: registry?.status,
      health: health
        ? {
          status: health.status,
          freshnessLabel: health.freshnessLabel,
          lastUpdatedAt: health.lastUpdatedAt,
          persistedCount: health.persistedCount,
          warnings: health.warnings,
        }
        : null,
      governance: policy,
      config: {
        requiresConfiguration: policy.requiresConfiguration,
        configured: policy.requiresConfiguration ? registry?.status !== "requiresConfiguration" : true,
      },
    };
  });

  return NextResponse.json({
    status: "ok",
    generatedAt: new Date().toISOString(),
    count: sources.length,
    sources,
  });
}
