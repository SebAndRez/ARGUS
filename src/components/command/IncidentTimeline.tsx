import type { IncidentTimelineEntry } from "@/types/incident";

export default function IncidentTimeline({
  entries,
}: {
  entries: IncidentTimelineEntry[];
}) {
  return (
    <div className="grid gap-2">
      {entries.slice(0, 5).map((entry) => (
        <div key={entry.id} className="border-l border-cyan-300/25 pl-3">
          <p className="text-xs font-semibold text-white">{entry.title}</p>
          <p className="mt-1 text-[0.64rem] leading-4 text-slate-400">{entry.summary}</p>
        </div>
      ))}
    </div>
  );
}
