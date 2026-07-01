import type { CommandSourceHealth } from "@/types/incident";
import {
  buildSourceHealthSummary,
  type SourceRuntimeMetadata,
} from "@/lib/sources/sourceHealthEngine";

export function getCommandSourceHealth(runtime: SourceRuntimeMetadata[] = []): CommandSourceHealth[] {
  return buildSourceHealthSummary(runtime).sources.slice(0, 12).map((source) => ({
    sourceId: source.id,
    name: source.name,
    status: mapCommandStatus(source.status),
    lastSeenAt: source.lastUpdatedAt ?? undefined,
    lastSuccessfulRunAt: source.lastUpdatedAt ?? undefined,
    lastError: source.status === "ERROR" ? source.warnings[0] : undefined,
    freshnessLabel: source.freshnessLabel,
  }));
}

function mapCommandStatus(status: string): CommandSourceHealth["status"] {
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "DEGRADED" || status === "NEEDS_KEY" || status === "NEEDS_REVIEW" || status === "ERROR") return "DEGRADED";
  if (status === "DISABLED" || status === "DEMO_ONLY") return "DISABLED";
  return "UNKNOWN";
}
