import {
  getDefaultRecommendedAction,
  type InterfaceVariant,
} from "@/config/argusDesignSystem";
import type { EventSeverity, EventType } from "@/types/crisis";

interface Props {
  action?: string | null;
  severity: EventSeverity;
  type: EventType;
  status?: string | null;
  variant?: InterfaceVariant;
  compact?: boolean;
}

export default function RecommendedActionBlock({
  action,
  severity,
  type,
  status,
  variant = "citizen",
  compact = false,
}: Props) {
  const displayAction =
    action?.trim() ||
    getDefaultRecommendedAction({
      severity,
      type,
      status,
      variant,
    });

  if (compact) {
    return (
      <div className="flex min-w-0 items-start gap-2 text-xs leading-4">
        <span
          className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 text-[0.55rem] font-bold text-cyan-200"
          aria-hidden="true"
        >
          &gt;
        </span>
        <p className="line-clamp-2 text-slate-300">{displayAction}</p>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-cyan-300/20 bg-cyan-400/8 p-4">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 text-sm font-bold text-cyan-200"
          aria-hidden="true"
        >
          &gt;
        </span>
        <p className="text-[0.65rem] font-semibold uppercase text-cyan-200">
          {variant === "citizen" ? "Qué hacer ahora" : "Acción recomendada"}
        </p>
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-slate-100">{displayAction}</p>
    </section>
  );
}
