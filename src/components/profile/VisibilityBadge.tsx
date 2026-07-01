import {
  visibilityDescriptions,
  visibilityLabels,
} from "@/data/profileVisibility";
import type { ProfileVisibility } from "@/types/argusProfile";

const styles: Record<ProfileVisibility, string> = {
  PUBLIC: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
  PRIVATE: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  AUTHORIZED_UNITS_ONLY: "border-blue-300/30 bg-blue-400/10 text-blue-100",
  EMERGENCY_ONLY: "border-red-300/30 bg-red-400/10 text-red-100",
  ADMIN_ONLY: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  HIDDEN: "border-slate-300/25 bg-slate-400/10 text-slate-100",
};

export default function VisibilityBadge({
  visibility,
  showDescription = false,
}: {
  visibility: ProfileVisibility;
  showDescription?: boolean;
}) {
  return (
    <span className="inline-flex flex-col gap-1">
      <span className={`w-fit rounded-full border px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-[0.12em] ${styles[visibility]}`}>
        {visibilityLabels[visibility]}
      </span>
      {showDescription ? (
        <span className="text-xs leading-5 text-slate-400">
          {visibilityDescriptions[visibility]}
        </span>
      ) : null}
    </span>
  );
}
