import type { RouteSegmentWarning } from "@/types/routing";

export default function RouteWarningsList({
  warnings,
}: {
  warnings: RouteSegmentWarning[];
}) {
  if (warnings.length === 0) {
    return <p className="text-xs text-slate-500">Sin advertencias de tramo.</p>;
  }

  return (
    <div className="grid gap-2">
      {warnings.map((warning) => (
        <div key={warning.id} className="rounded border border-white/10 bg-slate-900/65 p-2 text-xs text-slate-300">
          {warning.message}
        </div>
      ))}
    </div>
  );
}
