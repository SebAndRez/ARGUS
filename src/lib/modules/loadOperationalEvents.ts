import type { CrisisEvent } from "@/types/crisis";
import type {
  ModuleContextResult,
  ModuleIncidentPage,
  OperationalContextModuleId,
} from "@/types/moduleOperationalContext";
import { canonicalIncidentsToCrisisEvents } from "@/lib/modules/canonicalCrisisEvent";

/**
 * Shared client-side loader for the module dashboards. One call gives every
 * module the same two real inputs:
 *   - citizen reports + SOS (`/api/events`, redacted server-side per role);
 *   - canonical incidents from the ingestion pipeline (`/api/modules/incidents`,
 *     permission resolved server-side for `moduleId`).
 *
 * `demoFallbackAllowed` comes from the server's `isDemoDataAllowed()` and is
 * FALSE whenever it cannot be confirmed (request failed, field missing): a
 * module may only fall back to its demo dataset when this is true.
 */
export type OperationalEventsResult = {
  reports: CrisisEvent[];
  canonical: CrisisEvent[];
  events: CrisisEvent[];
  demoFallbackAllowed: boolean;
  canonicalState: ModuleContextResult<ModuleIncidentPage>["state"] | "error";
  reportsOk: boolean;
};

const CANONICAL_LIMIT = 100;

export async function loadOperationalEvents(moduleId: OperationalContextModuleId): Promise<OperationalEventsResult> {
  const [reportsOutcome, canonicalOutcome] = await Promise.allSettled([
    fetch("/api/events", { cache: "no-store" }).then(async (response) => ({
      ok: response.ok,
      body: (await response.json()) as { events?: CrisisEvent[]; demoFallbackAllowed?: boolean },
    })),
    fetch(`/api/modules/incidents?module=${moduleId}&limit=${CANONICAL_LIMIT}`, { cache: "no-store" }).then(
      async (response) => (await response.json()) as ModuleContextResult<ModuleIncidentPage>
    ),
  ]);

  const reportsOk = reportsOutcome.status === "fulfilled" && reportsOutcome.value.ok;
  const reports = reportsOk ? reportsOutcome.value.body.events ?? [] : [];
  const demoFallbackAllowed = reportsOk && reportsOutcome.value.body.demoFallbackAllowed === true;

  let canonical: CrisisEvent[] = [];
  let canonicalState: OperationalEventsResult["canonicalState"] = "error";
  if (canonicalOutcome.status === "fulfilled") {
    const context = canonicalOutcome.value;
    canonicalState = context.state;
    if ("data" in context) {
      // The gateway already excludes demo rows unless the server allows them.
      canonical = canonicalIncidentsToCrisisEvents(context.data.summaries);
    }
  }

  return {
    reports,
    canonical,
    events: [...canonical, ...reports],
    demoFallbackAllowed,
    canonicalState,
    reportsOk,
  };
}
