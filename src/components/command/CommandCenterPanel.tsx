import ArgusLimitationsNotice from "@/components/command/ArgusLimitationsNotice";
import CommandOverviewCards from "@/components/command/CommandOverviewCards";
import IncidentCommandCard from "@/components/command/IncidentCommandCard";
import OpenAqAirQualityPanel from "@/components/command/OpenAqAirQualityPanel";
import SmithsonianGvpVolcanoIntelligencePanel from "@/components/command/SmithsonianGvpVolcanoIntelligencePanel";
import SourceHealthPanel from "@/components/command/SourceHealthPanel";
import UsgsEarthquakeImpactPanel from "@/components/command/UsgsEarthquakeImpactPanel";
import MobileAppReadinessPanel from "@/components/mobile/MobileAppReadinessPanel";
import SourceStatusPanel from "@/components/sources/SourceStatusPanel";
import { getCommandCenterIncidents } from "@/lib/command/incidentBuilder";
import { getCommandSourceHealth } from "@/lib/command/sourceHealthService";

/**
 * ARGUS v1.0.3.4 — see docs/product/ARGUS_COMMAND_CENTER_STATUS.md. This
 * panel has no real operational incident source connected; it previously
 * called `buildDemoIncidents()` directly and unconditionally, and assumed
 * `incidents[0]` always existed. `getCommandCenterIncidents()` is
 * fail-closed (reuses `isDemoDataAllowed()`), so in production without
 * explicit authorization this renders an honest empty state instead.
 */
export default function CommandCenterPanel() {
  const { mode, incidents } = getCommandCenterIncidents();
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
        {mode === "demo" && (
          <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[0.56rem] font-bold uppercase text-cyan-100">
            Demo
          </span>
        )}
      </header>
      <div className="mt-4 grid gap-4">
        {mode === "demo-disabled" ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            Command Center sin fuente operacional conectada. Datos de demostración desactivados en este entorno.
          </p>
        ) : incidents.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            Sin incidentes de demostración disponibles en este momento.
          </p>
        ) : (
          <>
            <CommandOverviewCards incidents={incidents} />
            <IncidentCommandCard incident={incidents[0]} />
          </>
        )}
        <UsgsEarthquakeImpactPanel />
        <SmithsonianGvpVolcanoIntelligencePanel />
        <OpenAqAirQualityPanel />
        <SourceHealthPanel sources={sources} />
        <SourceStatusPanel />
        <MobileAppReadinessPanel />
        <ArgusLimitationsNotice />
      </div>
    </section>
  );
}
