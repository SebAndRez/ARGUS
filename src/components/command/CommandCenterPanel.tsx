import ArgusLimitationsNotice from "@/components/command/ArgusLimitationsNotice";
import CommandOverviewCards from "@/components/command/CommandOverviewCards";
import IncidentCommandCard from "@/components/command/IncidentCommandCard";
import SourceHealthPanel from "@/components/command/SourceHealthPanel";
import MobileAppReadinessPanel from "@/components/mobile/MobileAppReadinessPanel";
import SourceStatusPanel from "@/components/sources/SourceStatusPanel";
import { buildDemoIncidents } from "@/lib/command/incidentBuilder";
import { getCommandSourceHealth } from "@/lib/command/sourceHealthService";

export default function CommandCenterPanel() {
  const incidents = buildDemoIncidents();
  const sources = getCommandSourceHealth();

  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/90 p-4 shadow-2xl shadow-black/30">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-cyan-300/80">
            ARGUS Command Center
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Inteligencia de incidentes
          </h2>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[0.56rem] font-bold uppercase text-cyan-100">
          Demo
        </span>
      </header>
      <div className="mt-4 grid gap-4">
        <CommandOverviewCards incidents={incidents} />
        <IncidentCommandCard incident={incidents[0]} />
        <SourceHealthPanel sources={sources} />
        <SourceStatusPanel />
        <MobileAppReadinessPanel />
        <ArgusLimitationsNotice />
      </div>
    </section>
  );
}
