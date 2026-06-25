import {
  curatedConflictEvents,
  curatedNewsEvidence,
} from "@/data/conflictZones";

export const reliefWebProvider = {
  id: "reliefweb",
  name: "ReliefWeb",
  status: "active" as const,
  async getHumanitarianSignals() {
    return {
      provider: "reliefweb",
      mode: "demo_static",
      events: curatedConflictEvents.filter(
        (event) => event.rawProvider === "reliefweb"
      ),
      newsEvidence: curatedNewsEvidence.filter(
        (evidence) => evidence.sourceName === "ReliefWeb"
      ),
      disclaimer:
        "ReliefWeb aporta contexto humanitario/desastre; no reemplaza instrucciones oficiales locales.",
    };
  },
};
