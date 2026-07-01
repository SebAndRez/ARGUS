import ProductStatusBadge from "@/components/status/ProductStatusBadge";
import type { ProductStatusKind } from "@/types/productStatus";

const legendKinds: ProductStatusKind[] = [
  "OFFICIAL_SOURCE",
  "CITIZEN_REPORT",
  "ARGUS_ESTIMATE",
  "EXPERIMENTAL",
  "DEMO",
  "RUNTIME_ONLY",
  "FUTURE",
];

export default function ProductStatusLegend() {
  return (
    <section className="mt-4 border-t border-white/10 pt-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Estado de datos
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {legendKinds.map((kind) => (
          <ProductStatusBadge key={kind} kind={kind} compact />
        ))}
      </div>
    </section>
  );
}
