import type { IncidentStatus } from "@/types/incident";

export default function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-300">
      {status.replaceAll("_", " ")}
    </span>
  );
}
