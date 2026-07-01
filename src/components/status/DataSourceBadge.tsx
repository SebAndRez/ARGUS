import ProductStatusBadge from "@/components/status/ProductStatusBadge";
import type { ProductStatusKind } from "@/types/productStatus";

export default function DataSourceBadge({
  kind,
  label,
}: {
  kind: ProductStatusKind;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-black/20 px-2 py-1 text-[0.62rem] text-slate-300">
      <ProductStatusBadge kind={kind} compact />
      {label}
    </span>
  );
}
