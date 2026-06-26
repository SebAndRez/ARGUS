import type { IncidentEvidence } from "@/types/incident";

export default function IncidentEvidenceStack({
  evidence,
}: {
  evidence: IncidentEvidence[];
}) {
  return (
    <div className="grid gap-2">
      {evidence.slice(0, 4).map((item) => (
        <div key={item.id} className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="flex justify-between gap-2 text-xs">
            <span className="font-semibold text-white">{item.title}</span>
            <span className="text-cyan-200">+{item.confidenceImpact}</span>
          </div>
          <p className="mt-1 text-[0.65rem] leading-4 text-slate-400">{item.summary}</p>
        </div>
      ))}
    </div>
  );
}
