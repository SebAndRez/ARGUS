import type { SourceOperationalStatus } from "@/lib/sources/sourceRegistry";

const styles: Record<SourceOperationalStatus, string> = {
  ACTIVE: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  DEGRADED: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  DISABLED: "border-slate-300/20 bg-slate-400/10 text-slate-300",
  DEMO_ONLY: "border-violet-300/30 bg-violet-400/10 text-violet-100",
  NEEDS_KEY: "border-orange-300/30 bg-orange-400/10 text-orange-100",
  NEEDS_REVIEW: "border-blue-300/30 bg-blue-400/10 text-blue-100",
  ERROR: "border-red-300/30 bg-red-400/10 text-red-100",
};

export default function SourceHealthBadge({ status }: { status: SourceOperationalStatus }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[0.56rem] font-bold uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}
