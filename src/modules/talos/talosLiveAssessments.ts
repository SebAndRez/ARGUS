import type { CrisisEvent } from "@/types/crisis";
import type { TalosRiskAssessment } from "@/modules/talos/types";
import { calculateTalosRiskAssessment } from "@/modules/talos/talosScoring";
import { crisisEventToVigiaReport } from "@/modules/vigia/utils";
import { convertVigiaReportsToTalosSignals } from "@/modules/talos/talosVigiaBridge";
import { mapCrisisCategoryToTalosCategory } from "@/modules/talos/utils";

/**
 * The one place live TALOS assessments are computed from operational events
 * (canonical incidents + citizen reports, see `loadOperationalEvents`). TALOS
 * renders them and HERMES turns them into route risk zones — both must see the
 * same scores, so neither computes its own.
 */
export function assessTalosEvents(events: CrisisEvent[]): TalosRiskAssessment[] {
  return events
    .filter((event) => event.status !== "RESOLVED")
    .map((event) => {
      const isCitizenReport = event.type === "REPORT";
      const vigiaSignal = isCitizenReport ? convertVigiaReportsToTalosSignals([crisisEventToVigiaReport(event)]) : undefined;
      return calculateTalosRiskAssessment({
        event: {
          id: event.id,
          title: event.title,
          category: mapCrisisCategoryToTalosCategory(event.category),
          severity: event.severity,
          status: event.status,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          location: { lat: event.latitude, lng: event.longitude, label: event.locationText ?? undefined },
        },
        vigiaSignal,
      });
    });
}
