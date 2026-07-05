import type { ModuleBadgeVariant } from "@/types/argusModule";

const variantClasses: Record<ModuleBadgeVariant, string> = {
  neutral: "border-white/15 bg-white/[0.04] text-slate-300",
  info: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  success: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  warning: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  danger: "border-red-400/35 bg-red-500/12 text-red-100",
  institutional: "border-sky-300/25 bg-sky-400/10 text-sky-100",
  paid: "border-orange-300/25 bg-orange-400/10 text-orange-100",
};

interface Props {
  label: string;
  variant: ModuleBadgeVariant;
  className?: string;
}

export default function ModuleBadge({ label, variant, className = "" }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center border px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.14em] ${variantClasses[variant]} ${className}`}
    >
      {label}
    </span>
  );
}
