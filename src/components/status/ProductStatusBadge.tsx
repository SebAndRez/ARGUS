import { getProductStatusDefinition } from "@/lib/productStatus";
import type { ProductStatusKind } from "@/types/productStatus";

const toneClasses = {
  cyan: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  emerald: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  amber: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  orange: "border-orange-300/25 bg-orange-400/10 text-orange-100",
  red: "border-red-300/25 bg-red-400/10 text-red-100",
  slate: "border-white/10 bg-white/[0.04] text-slate-300",
  violet: "border-violet-300/25 bg-violet-400/10 text-violet-100",
};

export default function ProductStatusBadge({
  kind,
  compact = false,
}: {
  kind: ProductStatusKind;
  compact?: boolean;
}) {
  const definition = getProductStatusDefinition(kind);
  return (
    <span
      title={definition.description}
      className={`inline-flex items-center rounded-full border font-bold uppercase ${
        toneClasses[definition.tone]
      } ${compact ? "px-2 py-0.5 text-[0.55rem]" : "px-2.5 py-1 text-[0.6rem]"}`}
    >
      {definition.label}
    </span>
  );
}
