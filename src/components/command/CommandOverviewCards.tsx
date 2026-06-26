import type { IncidentCommandView } from "@/types/incident";

export default function CommandOverviewCards({
  incidents,
}: {
  incidents: IncidentCommandView[];
}) {
  const p0p1 = incidents.filter((incident) =>
    ["P0_CRITICAL", "P1_HIGH"].includes(incident.priority)
  ).length;
  const verifying = incidents.filter((incident) => incident.status === "VERIFYING").length;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Metric label="Activos" value={String(incidents.length)} />
      <Metric label="P0 / P1" value={String(p0p1)} />
      <Metric label="En verificacion" value={String(verifying)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/70 p-3">
      <p className="text-[0.56rem] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
