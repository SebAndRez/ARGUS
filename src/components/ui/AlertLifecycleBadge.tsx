import {
  getLifecycleLabel,
  getLifecycleTone,
} from "@/lib/alertLifecycle";
import type { AlertLifecycleStatus } from "@/types/crisis";

interface Props {
  status?: AlertLifecycleStatus | null;
  compact?: boolean;
}

const toneClasses = {
  info: "border-sky-300/25 bg-sky-400/10 text-sky-200",
  warning: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  success: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
  danger: "border-red-300/30 bg-red-500/10 text-red-200",
  muted: "border-slate-400/25 bg-slate-500/10 text-slate-300",
};

export default function AlertLifecycleBadge({ status, compact = false }: Props) {
  const tone = getLifecycleTone(status);

  return (
    <span
      className={`inline-flex items-center rounded-md border font-semibold uppercase ${toneClasses[tone]} ${
        compact ? "px-2 py-1 text-[0.58rem]" : "px-2.5 py-1 text-[0.65rem]"
      }`}
    >
      {getLifecycleLabel(status)}
    </span>
  );
}
