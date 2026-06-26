import IncidentEvidenceStack from "@/components/command/IncidentEvidenceStack";
import IncidentPriorityBadge from "@/components/command/IncidentPriorityBadge";
import IncidentStatusBadge from "@/components/command/IncidentStatusBadge";
import IncidentTimeline from "@/components/command/IncidentTimeline";
import RecommendedActionsList from "@/components/command/RecommendedActionsList";
import type { IncidentCommandView } from "@/types/incident";

export default function IncidentCommandCard({
  incident,
}: {
  incident: IncidentCommandView;
}) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-950/85 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-cyan-300/80">
            Incidente operativo
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">{incident.title}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <IncidentPriorityBadge priority={incident.priority} />
          <IncidentStatusBadge status={incident.status} />
        </div>
      </header>
      <p className="mt-3 text-xs leading-5 text-slate-400">{incident.argusSummary}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-white/10 bg-white/[0.03] p-2">
          Confianza: {incident.confidence}%
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] p-2">
          Severidad: {incident.severity}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <IncidentEvidenceStack evidence={incident.evidence} />
        <RecommendedActionsList actions={incident.recommendedActions.slice(0, 4)} />
        <IncidentTimeline entries={incident.timeline} />
      </div>
    </article>
  );
}
