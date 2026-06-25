import {
  curatedConflictEvents,
  curatedNewsEvidence,
} from "@/data/conflictZones";

export const gdeltProvider = {
  id: "gdelt",
  name: "GDELT",
  status: "active" as const,
  async getOpenSourceSignals() {
    return {
      provider: "gdelt",
      mode: "demo_static",
      events: curatedConflictEvents.filter((event) => event.rawProvider === "gdelt"),
      newsEvidence: curatedNewsEvidence.filter(
        (evidence) => evidence.sourceName === "GDELT"
      ),
      disclaimer:
        "GDELT se presenta como open_source_signal; no es confirmacion absoluta.",
    };
  },
};
